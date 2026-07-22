const generateReferralCode = (fullName) => {
  const prefix = fullName
    .replace(/\s+/g, "")
    .substring(0, 5)
    .toUpperCase();

  const randomNumber = Math.floor(1000 + Math.random() * 9000);

  return `${prefix}${randomNumber}`;
};

export default generateReferralCode;