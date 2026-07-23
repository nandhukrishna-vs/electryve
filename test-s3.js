import { ListBucketsCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import s3 from "./src/config/s3.js";

dotenv.config();

try {

    const result = await s3.send(
        new ListBucketsCommand({})
    );

    console.log(result.Buckets);

} catch (error) {

    console.error(error);

}