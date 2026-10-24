import mongoose from "mongoose";

const connectDB = async () => {
  const isTest = process.env.NODE_ENV === "test";
  const uri = isTest
    ? process.env.TEST_MONGODB_URI ||
      process.env.TEST_MONGO_URI ||
      "mongodb://127.0.0.1:27017/electryve_test"
    : process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!uri) {
    console.error(
      "[DATABASE CONFIG ERROR] Neither MONGODB_URI nor MONGO_URI is defined in environment variables."
    );
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Database connection error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
