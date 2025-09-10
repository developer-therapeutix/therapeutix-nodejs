// User repository backed by DynamoDB
// Table design (multi-GSI approach for quick migration simplicity):
//   Primary Key: userId (string)
//   GSIs:
//     EmailIndex:                email (HASH)
//     EmailVerificationTokenIndex: emailVerificationToken (HASH)
//     RefreshTokenIndex:         refreshToken (HASH)
//     ResetPasswordTokenIndex:   resetPasswordToken (HASH)
//     SubscribeNewsletterTokenIndex: subscribeNewsletterToken (HASH)
// Many attributes will be absent most of the time; that's fine—items without the indexed attribute simply don't appear in that GSI.
// NOTE: Longer term you can reduce GSI count with an entity + token indirection pattern; kept explicit here for clarity & speed.

const { v4: uuid } = require('uuid');
const { ddb } = require('../db/dynamo');
const {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand
} = require('@aws-sdk/lib-dynamodb');

const TABLE = process.env.DDB_USERS_TABLE;

// Projection helper: attributes generally returned untouched; add a minimal sanitizer if needed.
function normalize(user) {
  return user || null;
}

// Create a new user (email uniqueness enforced by querying the EmailIndex first)
async function createUser({ email, passwordHash, language, eulaAccepted, newsletterSubscribed }) {
  const existing = await getUserByEmail(email);
  if (existing) {
    const err = new Error('Email already exists');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }
  const userId = uuid();
  const now = new Date().toISOString();
  const item = {
    userId,
    email: email.toLowerCase(),
    password: passwordHash,
    enabled: true,
    approved: false,
    registrationComplete: false,
    initialQuestionnaireSubmitted: false,
    emailVerified: false,
    language: language || 'en',
    role: 'Patient',
    createdAt: now,
    loginCount: 0,
    newsletterSubscribed: !!newsletterSubscribed,
    eulaAccepted: !!eulaAccepted
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  return normalize(item);
}

async function getUserById(userId) {
    const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: { userId } }));
    return normalize(Item);
}

async function getUserByEmail(email) {
  if (!email) return null;
  const { Items } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'EmailIndex',
    KeyConditionExpression: 'email = :e',
    ExpressionAttributeValues: { ':e': email.toLowerCase() },
    Limit: 1
  }));
  return normalize(Items && Items[0]);
}

async function getUserByEmailVerificationToken(token) {
  if (!token) return null;
  const { Items } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'EmailVerificationTokenIndex',
    KeyConditionExpression: 'emailVerificationToken = :t',
    ExpressionAttributeValues: { ':t': token },
    Limit: 1
  }));
  return normalize(Items && Items[0]);
}

async function getUserByRefreshToken(refreshToken) {
  if (!refreshToken) return null;
  const { Items } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'RefreshTokenIndex',
    KeyConditionExpression: 'refreshToken = :t',
    ExpressionAttributeValues: { ':t': refreshToken },
    Limit: 1
  }));
  return normalize(Items && Items[0]);
}

async function getUserByResetPasswordToken(token) {
  if (!token) return null;
  const { Items } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'ResetPasswordTokenIndex',
    KeyConditionExpression: 'resetPasswordToken = :t',
    ExpressionAttributeValues: { ':t': token },
    Limit: 1
  }));
  return normalize(Items && Items[0]);
}

async function getUserBySubscribeNewsletterToken(token) {
  if (!token) return null;
  const { Items } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'SubscribeNewsletterTokenIndex',
    KeyConditionExpression: 'subscribeNewsletterToken = :t',
    ExpressionAttributeValues: { ':t': token },
    Limit: 1
  }));
  return normalize(Items && Items[0]);
}

// Generic partial update. Only updates provided keys.
async function updateUser(userId, fields) {
  if (!fields || Object.keys(fields).length === 0) return getUserById(userId);

  const names = {};
  const values = {};
  const sets = [];
  const removes = [];

  Object.entries(fields).forEach(([k, v]) => {
    const nameKey = `#${k}`;
    names[nameKey] = k;
    if (v === null || typeof v === 'undefined') {
      // Remove attribute (esp. important for GSI keys like tokens; cannot set to NULL)
      removes.push(nameKey);
    } else {
      const valueKey = `:${k}`;
      values[valueKey] = v;
      sets.push(`${nameKey} = ${valueKey}`);
    }
  });

  if (!sets.length && !removes.length) return getUserById(userId);

  const parts = [];
  if (sets.length) parts.push('SET ' + sets.join(', '));
  if (removes.length) parts.push('REMOVE ' + removes.join(', '));
  const UpdateExpression = parts.join(' ');

  const params = {
    TableName: TABLE,
    Key: { userId },
    UpdateExpression,
    ExpressionAttributeNames: names,
    ReturnValues: 'ALL_NEW'
  };
  if (Object.keys(values).length) params.ExpressionAttributeValues = values;

  const { Attributes } = await ddb.send(new UpdateCommand(params));
  return normalize(Attributes);
}

async function deleteUser(userId) {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { userId } }));
  return true;
}

// List users (simple scan – consider pagination + projection). For production, replace Scan with a GSI on role or createdAt if you need sorted listing.
async function listUsers({ limit = 50, lastEvaluatedKey } = {}) {
  const params = {
    TableName: TABLE,
    Limit: limit
  };
  if (lastEvaluatedKey) params.ExclusiveStartKey = lastEvaluatedKey;
  const { Items, LastEvaluatedKey } = await ddb.send(new ScanCommand(params));
  return { users: Items || [], lastEvaluatedKey: LastEvaluatedKey };
}

module.exports = {
  createUser,
  getUserById,
  getUserByEmail,
  getUserByEmailVerificationToken,
  getUserByRefreshToken,
  getUserByResetPasswordToken,
  getUserBySubscribeNewsletterToken,
  updateUser,
  deleteUser,
  listUsers
};
