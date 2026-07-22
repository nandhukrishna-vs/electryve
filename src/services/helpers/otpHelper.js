import Otp from "../../models/Otp.js";

import generateOtp from "../../utils/generateOtp.js";

import sendEmail from "../../utils/sendEmail.js";

const OTP_EXPIRY_MS = 60 * 1000;

const createAndSendOtp = async ({
  email,
  purpose,
  subject,
  heading
}) => {

  const otp = generateOtp();

  await Otp.deleteMany({
    email,
    purpose
  });

  await Otp.create({
    email,
    otp,
    purpose,
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MS)
  });

  await sendEmail(
    email,
    subject,
    `
      <h2>${heading}</h2>
      <p>${otp}</p>
      <p>This OTP expires in 60 seconds.</p>
    `
  );

  return otp;

};

export {
  createAndSendOtp
};