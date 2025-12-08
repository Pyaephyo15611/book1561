import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { backblazeConfig } from '../firebase';

export const uploadFileToBackblaze = async (file, filePath) => {
  try {
    const s3Client = new S3Client({
      region: backblazeConfig.region,
      endpoint: `https://${backblazeConfig.endpoint}`,
      credentials: {
        accessKeyId: backblazeConfig.accessKeyId,
        secretAccessKey: backblazeConfig.secretAccessKey,
      },
      forcePathStyle: backblazeConfig.s3ForcePathStyle,
    });

    const params = {
      Bucket: backblazeConfig.bucketName,
      Key: filePath,
      Body: file,
      ContentType: file.type,
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    // Return the public URL of the uploaded file
    return `https://${backblazeConfig.bucketName}.s3.${backblazeConfig.region}.backblazeb2.com/${filePath}`;
  } catch (error) {
    console.error('Error uploading to Backblaze B2:', error);
    throw error;
  }
};

export const deleteFileFromBackblaze = async (filePath) => {
  try {
    const s3Client = new S3Client({
      region: backblazeConfig.region,
      endpoint: `https://${backblazeConfig.endpoint}`,
      credentials: {
        accessKeyId: backblazeConfig.accessKeyId,
        secretAccessKey: backblazeConfig.secretAccessKey,
      },
      forcePathStyle: backblazeConfig.s3ForcePathStyle,
    });

    const params = {
      Bucket: backblazeConfig.bucketName,
      Key: filePath,
    };

    const command = new DeleteObjectCommand(params);
    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error('Error deleting from Backblaze B2:', error);
    throw error;
  }
};
