import * as walletService from "../services/walletService.js";

/**
 * Renders the user's wallet dashboard with verified balance, summary, and paginated transactions.
 */
export const loadWallet = async (req, res, next) => {
  try {
    if (!req.session?.user?.id) {
      return res.redirect("/auth/login");
    }

    const userId = req.session.user.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 10;

    const [summary, transactionsData] = await Promise.all([
      walletService.getWalletSummary(userId),
      walletService.getWalletTransactions(userId, { page, limit })
    ]);

    res.render("user/wallet", {
      layout: "layouts/user-layout",
      title: "My Wallet",
      balance: summary.balance,
      totalRefunded: summary.totalRefunded,
      totalSpent: summary.totalSpent,
      transactions: transactionsData.transactions,
      totalPages: transactionsData.totalPages,
      currentPage: transactionsData.currentPage,
      totalCount: transactionsData.totalCount
    });
  } catch (error) {
    console.error("Load Wallet Error:", error);
    next(error);
  }
};

export default {
  loadWallet
};
