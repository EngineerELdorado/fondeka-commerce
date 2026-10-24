# Private training files in the existing media bucket

The backend stores paid course files under `commerce-training-assets/{ownerAccountId}/{uuid}.{ext}` in the existing media bucket. Uploads return no public URL; paid access uses short-lived S3 presigned GET URLs. **The bucket/CDN must independently prevent public reads of this prefix.** This document is a deployment instruction; no cloud policy has been changed by the code implementation.

## Scope the privacy rule to training content

Existing product/store media may intentionally remain public. Do not enable a blanket policy that breaks those images. Merge a rule scoped to `commerce-training-assets/*` into the existing bucket policy, using the actual bucket name and actual IAM principal that signs backend S3 requests:

```json
{
  "Sid": "DenyTrainingReadsExceptBackendSigner",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::YOUR_MEDIA_BUCKET/commerce-training-assets/*",
  "Condition": {
    "ArnNotEquals": {
      "aws:PrincipalArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/YOUR_BACKEND_ROLE"
    }
  }
}
```

If the backend uses an IAM user instead of an assumed role, use that user's ARN. If dev and production use different signers against the same bucket, include the explicitly authorized ARNs as an array. The signer still needs its normal `s3:GetObject` permission; this exception does not grant it permissions. For an assumed role, use the IAM role ARN, not a particular STS session ARN. Review existing policy statements before deployment.

AWS describes using [an explicit deny and `aws:PrincipalArn` to restrict a bucket to a role](https://aws.amazon.com/blogs/security/how-to-restrict-amazon-s3-bucket-access-to-a-specific-iam-role/). Its [policy evaluation overview](https://docs.aws.amazon.com/us_en/AmazonS3/latest/userguide/access-policy-language-overview.html) explains why a deny takes precedence over an allow, including public grants. Adapt this prefix-scoped example to the deployment's actual storage architecture.

This rule denies anonymous/direct reads and other principals (including a CDN origin identity) for this prefix while allowing the backend signer to inspect objects and issue usable signed URLs. If a CDN has already cached a training object, invalidate those cached paths too. Do not route paid file downloads through a publicly cached CDN path. The backend signs direct S3 URLs.

## Verify before releasing FILE materials

1. Upload a test file through the training presign endpoint using a store owner account.
2. Request its unsigned S3 URL anonymously: expect 403.
3. Request its public media/CDN URL anonymously: expect denial, including after cache invalidation.
4. Publish the file material; server-side HEAD validation must succeed with backend credentials.
5. From a qualifying paid order, fetch the material `/access` and open the returned signed URL: expect 200.
6. Repeat `/access` with a pending/refunded order or wrong account/token: expect denial.
7. Confirm that ordinary public product/store images still load.

Do not paste signed URLs or order access tokens into support logs. A signed URL is usable until expiry by anyone holding it; the application revalidates the purchase before issuing a new one.
