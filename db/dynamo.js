// DynamoDB DocumentClient setup
// Uses AWS SDK v3. Expects AWS credentials to be resolved via default provider chain (env vars, shared config, IAM role, etc.).
// Required env vars: AWS_REGION (and DDB_USERS_TABLE for repositories).

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const region = process.env.AWS_REGION || 'eu-central-1';

// Base client
const base = new DynamoDBClient({ region });

// Document client with sane defaults
const ddb = DynamoDBDocumentClient.from(base, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: true
  },
  unmarshallOptions: {}
});

module.exports = { ddb };
