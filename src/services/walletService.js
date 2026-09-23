import mongoose from "mongoose";
import Wallet from "../models/Wallet.js";
import WalletTransaction from "../models/WalletTransaction.js";

/**
 * Ensures a user has a wallet document, creating one atomically if none exists.
 */
const getOrCreateWallet = async (userId) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID provided for wallet operation.");
  }

  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    try {
      wallet = await Wallet.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId, balance: 0 } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
    } catch (err) {
      if (err.code === 11000) {
        wallet = await Wallet.findOne({ userId });
      } else {
        throw err;
      }
    }
  }
  return wallet;
};

/**
 * Retrieves the user's wallet document.
 */
const getWallet = async (userId) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }
  return await Wallet.findOne({ userId });
};

/**
 * Retrieves the current verified wallet balance.
 */
const getWalletBalance = async (userId) => {
  const wallet = await getOrCreateWallet(userId);
  return Math.round((wallet.balance || 0) * 100) / 100;
};

/**
 * Atomically credits a user's wallet with idempotency protection.
 */
const creditWallet = async ({
  userId,
  amount,
  source = "REFUND",
  description = "Wallet refund",
  idempotencyKey,
  orderId = null,
  orderItemId = null,
  returnRequestId = null,
  referenceId = null
}) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return { success: false, message: "Invalid user ID." };
  }

  const numericAmount = Number(amount);
  if (!numericAmount || isNaN(numericAmount) || !isFinite(numericAmount) || numericAmount <= 0) {
    return { success: false, message: "A valid positive amount is required for wallet credit." };
  }

  if (!idempotencyKey || typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    return { success: false, message: "A stable idempotency key is required for wallet credit." };
  }

  const cleanKey = idempotencyKey.trim();
  const roundedAmount = Math.round(numericAmount * 100) / 100;

  // 1. Idempotency Check: Return existing completed transaction if already processed
  const existingTx = await WalletTransaction.findOne({ idempotencyKey: cleanKey });
  if (existingTx) {
    const currentWallet = await getOrCreateWallet(userId);
    return {
      success: true,
      transaction: existingTx,
      balance: currentWallet.balance,
      isDuplicate: true,
      message: "Transaction already processed."
    };
  }

  // 2. Ensure wallet exists
  await getOrCreateWallet(userId);

  // 3. Perform atomic balance increment
  const updatedWallet = await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { balance: roundedAmount } },
    { returnDocument: 'after' }
  );

  if (!updatedWallet) {
    return { success: false, message: "Failed to update wallet balance." };
  }

  const balanceAfter = Math.round(updatedWallet.balance * 100) / 100;
  const balanceBefore = Math.round((balanceAfter - roundedAmount) * 100) / 100;

  // 4. Persist WalletTransaction
  const transaction = new WalletTransaction({
    userId,
    walletId: updatedWallet._id,
    type: "CREDIT",
    source,
    amount: roundedAmount,
    balanceBefore,
    balanceAfter,
    orderId: orderId && mongoose.Types.ObjectId.isValid(orderId) ? orderId : null,
    orderItemId: orderItemId && mongoose.Types.ObjectId.isValid(orderItemId) ? orderItemId : null,
    returnRequestId: returnRequestId ? String(returnRequestId) : null,
    referenceId: referenceId ? String(referenceId) : null,
    description: description.trim(),
    idempotencyKey: cleanKey,
    status: "COMPLETED"
  });

  try {
    await transaction.save();
  } catch (err) {
    if (err.code === 11000) {
      // Race condition: another thread saved this idempotencyKey
      // Revert our balance increment
      await Wallet.updateOne({ userId }, { $inc: { balance: -roundedAmount } }).catch(() => {});
      const winningTx = await WalletTransaction.findOne({ idempotencyKey: cleanKey });
      const refreshedWallet = await Wallet.findOne({ userId });
      return {
        success: true,
        transaction: winningTx,
        balance: refreshedWallet ? refreshedWallet.balance : balanceBefore,
        isDuplicate: true,
        message: "Transaction already processed."
      };
    }
    // Unexpected error: compensate balance before throwing
    await Wallet.updateOne({ userId }, { $inc: { balance: -roundedAmount } }).catch(() => {});
    throw err;
  }

  return {
    success: true,
    transaction,
    balance: balanceAfter,
    isDuplicate: false,
    message: "Wallet credited successfully."
  };
};

/**
 * Atomically debits a user's wallet with conditional balance check (balance >= amount)
 * and idempotency protection.
 */
const debitWallet = async ({
  userId,
  amount,
  source = "ORDER_PAYMENT",
  description = "Order payment using Electryve Wallet",
  idempotencyKey,
  orderId = null,
  orderItemId = null,
  returnRequestId = null,
  referenceId = null
}) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return { success: false, message: "Invalid user ID." };
  }

  const numericAmount = Number(amount);
  if (!numericAmount || isNaN(numericAmount) || !isFinite(numericAmount) || numericAmount <= 0) {
    return { success: false, message: "A valid positive amount is required for wallet debit." };
  }

  if (!idempotencyKey || typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    return { success: false, message: "A stable idempotency key is required for wallet debit." };
  }

  const cleanKey = idempotencyKey.trim();
  const roundedAmount = Math.round(numericAmount * 100) / 100;

  // 1. Idempotency Check: Return existing completed transaction if already processed
  const existingTx = await WalletTransaction.findOne({ idempotencyKey: cleanKey });
  if (existingTx) {
    const currentWallet = await getOrCreateWallet(userId);
    return {
      success: true,
      transaction: existingTx,
      balance: currentWallet.balance,
      isDuplicate: true,
      message: "Transaction already processed."
    };
  }

  // 2. Ensure wallet exists
  await getOrCreateWallet(userId);

  // 3. Perform atomic conditional balance decrement (balance >= roundedAmount)
  const updatedWallet = await Wallet.findOneAndUpdate(
    {
      userId,
      balance: { $gte: roundedAmount }
    },
    {
      $inc: { balance: -roundedAmount }
    },
    { returnDocument: 'after' }
  );

  if (!updatedWallet) {
    return {
      success: false,
      code: "INSUFFICIENT_WALLET_BALANCE",
      message: "Insufficient wallet balance to complete this transaction."
    };
  }

  const balanceAfter = Math.round(updatedWallet.balance * 100) / 100;
  const balanceBefore = Math.round((balanceAfter + roundedAmount) * 100) / 100;

  // 4. Persist WalletTransaction
  const transaction = new WalletTransaction({
    userId,
    walletId: updatedWallet._id,
    type: "DEBIT",
    source,
    amount: roundedAmount,
    balanceBefore,
    balanceAfter,
    orderId: orderId && mongoose.Types.ObjectId.isValid(orderId) ? orderId : null,
    orderItemId: orderItemId && mongoose.Types.ObjectId.isValid(orderItemId) ? orderItemId : null,
    returnRequestId: returnRequestId ? String(returnRequestId) : null,
    referenceId: referenceId ? String(referenceId) : null,
    description: description.trim(),
    idempotencyKey: cleanKey,
    status: "COMPLETED"
  });

  try {
    await transaction.save();
  } catch (err) {
    if (err.code === 11000) {
      // Race condition: another thread saved this idempotencyKey
      // Revert our balance decrement
      await Wallet.updateOne({ userId }, { $inc: { balance: roundedAmount } }).catch(() => {});
      const winningTx = await WalletTransaction.findOne({ idempotencyKey: cleanKey });
      const refreshedWallet = await Wallet.findOne({ userId });
      return {
        success: true,
        transaction: winningTx,
        balance: refreshedWallet ? refreshedWallet.balance : balanceBefore,
        isDuplicate: true,
        message: "Transaction already processed."
      };
    }
    // Unexpected error: compensate balance before throwing
    await Wallet.updateOne({ userId }, { $inc: { balance: roundedAmount } }).catch(() => {});
    throw err;
  }

  return {
    success: true,
    transaction,
    balance: balanceAfter,
    isDuplicate: false,
    message: "Wallet debited successfully."
  };
};

/**
 * Retrieves paginated wallet transactions for a user.
 */
const getWalletTransactions = async (userId, { page = 1, limit = 10 } = {}) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return {
      transactions: [],
      totalPages: 1,
      currentPage: 1,
      totalCount: 0
    };
  }

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 50));
  const skip = (parsedPage - 1) * parsedLimit;

  const [transactions, totalCount] = await Promise.all([
    WalletTransaction.find({ userId })
      .populate("orderId", "orderNumber")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean(),
    WalletTransaction.countDocuments({ userId })
  ]);

  const totalPages = Math.ceil(totalCount / parsedLimit) || 1;

  return {
    transactions,
    totalPages,
    currentPage: parsedPage,
    totalCount,
    limit: parsedLimit
  };
};

/**
 * Retrieves a summary of the user's wallet activity.
 */
const getWalletSummary = async (userId) => {
  const wallet = await getOrCreateWallet(userId);
  const balance = Math.round((wallet.balance || 0) * 100) / 100;

  const [creditAgg, debitAgg] = await Promise.all([
    WalletTransaction.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), type: "CREDIT", status: "COMPLETED" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]),
    WalletTransaction.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), type: "DEBIT", status: "COMPLETED" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ])
  ]);

  const totalRefunded = creditAgg[0]?.total ? Math.round(creditAgg[0].total * 100) / 100 : 0;
  const totalSpent = debitAgg[0]?.total ? Math.round(debitAgg[0].total * 100) / 100 : 0;

  return {
    wallet,
    balance,
    totalRefunded,
    totalSpent
  };
};

export {
  getOrCreateWallet,
  getWallet,
  getWalletBalance,
  creditWallet,
  debitWallet,
  getWalletTransactions,
  getWalletSummary
};

export default {
  getOrCreateWallet,
  getWallet,
  getWalletBalance,
  creditWallet,
  debitWallet,
  getWalletTransactions,
  getWalletSummary
};
