// Support Request repository (DynamoDB)
// Table: therapeutix_support_request (env: DDB_SUPPORT_TABLE)
// PK: ticketId (S)
// GSIs:
//   UserIndex   -> PK: userId (HASH),  SK: createdAt (RANGE)
//   StatusIndex -> PK: status (HASH),  SK: createdAt (RANGE)
// Access patterns supported:
//   - get by ticketId
//   - list requests for a user (chronological)
//   - list requests by status (open, in_progress, closed)
//   - create, update, close
//   - (optional) delete

const { ddb } = require('../db/dynamo');
const {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand
} = require('@aws-sdk/lib-dynamodb');

const TABLE = process.env.DDB_SUPPORT_TABLE || 'therapeutix_support_request';

function nowIso() { return new Date().toISOString(); }

// Generate a short, readable ticket id like SR-20250910-ABC123
function generateTicketId(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `SR-${yyyy}${mm}${dd}-${rand}`;
}

async function createSupportRequest({ userId, subject, message, attachments = [], metadata }) {
  if (!userId) throw new Error('userId required');
  if (!subject) throw new Error('subject required');
  if (!message) throw new Error('message required');

  const createdAt = nowIso();
  const updatedAt = createdAt;
  let ticketId;
  // Up to 5 attempts in extremely unlikely collision scenario
  for (let i = 0; i < 5; i++) {
    ticketId = generateTicketId();
    try {
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          ticketId,
          userId,
            subject,
            message,
            attachments: attachments.filter(Boolean),
            status: 'open',
            closed: false,
            metadata,
            createdAt,
            updatedAt
        },
        ConditionExpression: 'attribute_not_exists(ticketId)'
      }));
      return await getSupportRequest(ticketId);
    } catch (err) {
      if (err.name === 'ConditionalCheckFailedException' && i < 4) continue; // retry new id
      throw err;
    }
  }
  // fallback (should never reach here)
  throw new Error('Failed to generate unique ticketId');
}

async function getSupportRequest(ticketId) {
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: { ticketId } }));
  return Item || null;
}

// Generic update (similar to userRepo) with REMOVE for null/undefined
async function updateSupportRequest(ticketId, fields) {
  if (!fields || Object.keys(fields).length === 0) return getSupportRequest(ticketId);
  const names = { '#updatedAt': 'updatedAt' };
  const values = { ':updatedAt': nowIso() };
  const sets = ['#updatedAt = :updatedAt'];
  const removes = [];
  Object.entries(fields).forEach(([k, v]) => {
    const nameKey = `#${k}`;
    names[nameKey] = k;
    if (v === null || typeof v === 'undefined') {
      removes.push(nameKey);
    } else {
      const valueKey = `:${k}`;
      values[valueKey] = v;
      sets.push(`${nameKey} = ${valueKey}`);
    }
  });
  const parts = [];
  if (sets.length) parts.push('SET ' + sets.join(', '));
  if (removes.length) parts.push('REMOVE ' + removes.join(', '));
  const UpdateExpression = parts.join(' ');
  const params = {
    TableName: TABLE,
    Key: { ticketId },
    UpdateExpression,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ReturnValues: 'ALL_NEW'
  };
  const { Attributes } = await ddb.send(new UpdateCommand(params));
  return Attributes;
}

async function closeSupportRequest(ticketId, closedBy) {
  return updateSupportRequest(ticketId, {
    status: 'closed',
    closed: true,
    closedAt: nowIso(),
    closedBy
  });
}

async function deleteSupportRequest(ticketId) {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { ticketId } }));
  return true;
}

// List by user with pagination
async function listSupportRequestsByUser(userId, { limit = 25, cursor } = {}) {
  const params = {
    TableName: TABLE,
    IndexName: 'UserIndex',
    KeyConditionExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': userId },
    Limit: limit,
    ScanIndexForward: false // newest first (createdAt desc)
  };
  if (cursor) params.ExclusiveStartKey = cursor;
  const { Items, LastEvaluatedKey } = await ddb.send(new QueryCommand(params));
  return { items: Items || [], cursor: LastEvaluatedKey };
}

// List by status (open, in_progress, closed)
async function listSupportRequestsByStatus(status, { limit = 25, cursor } = {}) {
  const params = {
    TableName: TABLE,
    IndexName: 'StatusIndex',
    KeyConditionExpression: '#s = :s',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':s': status },
    Limit: limit,
    ScanIndexForward: false
  };
  if (cursor) params.ExclusiveStartKey = cursor;
  const { Items, LastEvaluatedKey } = await ddb.send(new QueryCommand(params));
  return { items: Items || [], cursor: LastEvaluatedKey };
}

module.exports = {
  createSupportRequest,
  getSupportRequest,
  updateSupportRequest,
  closeSupportRequest,
  deleteSupportRequest,
  listSupportRequestsByUser,
  listSupportRequestsByStatus
};
