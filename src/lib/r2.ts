import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID?.trim();
const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
const bucketName = process.env.R2_BUCKET_NAME?.trim();

let s3ClientInstance: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(accountId && accessKeyId && secretAccessKey && bucketName);
}

export function getR2BucketName(): string {
  return bucketName || "";
}

export function getR2Client(): S3Client | null {
  if (!isR2Configured()) {
    return null;
  }
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });
  }
  return s3ClientInstance;
}

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string
): Promise<boolean> {
  const client = getR2Client();
  if (!client || !bucketName) return false;

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: typeof body === "string" ? Buffer.from(body) : body,
      ContentType: contentType,
    });
    await client.send(command);
    return true;
  } catch (error) {
    console.error(`Failed to upload ${key} to Cloudflare R2:`, error);
    return false;
  }
}

export async function getFromR2(
  key: string
): Promise<{ data: Buffer; contentType: string } | null> {
  const client = getR2Client();
  if (!client || !bucketName) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    const response = await client.send(command);
    if (!response.Body) return null;

    // Convert stream to Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk as Uint8Array);
    }
    const data = Buffer.concat(chunks);
    const contentType = response.ContentType || "application/octet-stream";

    return { data, contentType };
  } catch (error: any) {
    if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    console.error(`Failed to fetch ${key} from Cloudflare R2:`, error);
    return null;
  }
}

export async function deleteFromR2(key: string): Promise<boolean> {
  const client = getR2Client();
  if (!client || !bucketName) return false;

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    await client.send(command);
    return true;
  } catch (error) {
    console.error(`Failed to delete ${key} from Cloudflare R2:`, error);
    return false;
  }
}
