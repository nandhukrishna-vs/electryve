import {
  PutObjectCommand,
  DeleteObjectCommand
} from "@aws-sdk/client-s3";

import s3 from "../config/s3.js";
import crypto from "crypto";
import path from "path";

const uploadImage = async (file, folder) => {

  const extension = path.extname(file.originalname);

  const fileName = `${folder}/${crypto.randomUUID()}${extension}`;

  const command = new PutObjectCommand({

    Bucket: process.env.AWS_BUCKET_NAME,

    Key: fileName,

    Body: file.buffer,

    ContentType: file.mimetype

  });

  await s3.send(command);

  return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

};

const deleteImage = async (imageUrl) => {

  if (!imageUrl) return;

  const key = imageUrl.split(".amazonaws.com/")[1];

  if (!key) return;

  const command = new DeleteObjectCommand({

    Bucket: process.env.AWS_BUCKET_NAME,

    Key: key

  });

  await s3.send(command);

};

export {
  uploadImage,
  deleteImage
};