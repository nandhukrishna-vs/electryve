import {
  PutObjectCommand,
  DeleteObjectCommand
} from "@aws-sdk/client-s3";

import s3 from "../config/s3.js";
import crypto from "crypto";
import path from "path";

const ALLOWED_FOLDERS = [
  "avatars",
  "products",
  "brands",
  "banners",
  "categories"
];

const ALLOWED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp"
];

const getImageUrl = (key) => {

  return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

};

const uploadImage = async (file, folder) => {

    if (!file) {
        throw new Error("No image provided");
    }

    if (!ALLOWED_FOLDERS.includes(folder)) {
        throw new Error("Invalid upload folder");
        }
  
  const extension = path
  .extname(file.originalname)
  .toLowerCase();

if (!ALLOWED_EXTENSIONS.includes(extension)) {
  throw new Error("Invalid image format");
}

  const fileName =
`${folder}/${Date.now()}-${crypto.randomUUID()}${extension}`;

  const command = new PutObjectCommand({

    Bucket: process.env.AWS_BUCKET_NAME,

    Key: fileName,

    Body: file.buffer,

    ContentType: file.mimetype

  });

  try {

  await s3.send(command);

  return getImageUrl(fileName);

} catch (error) {

  console.error("S3 Upload Error:", error);

  throw new Error("Failed to upload image");

}

};
const uploadImages = async (files, folder) => {

    if (!files || files.length === 0) {
  return [];
}

  const uploadedImages = [];

  try {

    for (const file of files) {

      const imageUrl = await uploadImage(file, folder);

      uploadedImages.push(imageUrl);

    }

    return uploadedImages;

  } catch (error) {

    // Rollback uploaded images
    for (const imageUrl of uploadedImages) {

      try {

        await deleteImage(imageUrl);

      } catch (deleteError) {

        console.error(
          "Rollback failed:",
          deleteError.message
        );

      }

    }

    throw error;

  }

};

const deleteImage = async (imageUrl) => {

  if (!imageUrl) return;

  const prefix = ".amazonaws.com/";

if (!imageUrl.includes(prefix)) {
  return;
}

const key = imageUrl.split(prefix)[1];

  if (!key) return;

  const command = new DeleteObjectCommand({

    Bucket: process.env.AWS_BUCKET_NAME,

    Key: key

  });

 try {

  await s3.send(command);

} catch (error) {

  console.error("S3 Delete Error:", error);

}

};

export {
  uploadImage,
  uploadImages,
  deleteImage
};