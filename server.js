require('dotenv').config();
const express = require('express');
const { DynamoDBClient, ListTablesCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const authRoutes = require('./routes/middleware/auth');
const rootRoutes = require('./routes/root');
const supportRoutes = require('./routes/support');
const documentRoutes = require('./routes/documents');
const userRoutes = require('./routes/user');
const questionnaireRoutes = require('./routes/questionnaire');
const imagesRoutes = require('./routes/images');

const app = express();
// Use higher JSON limits for heavy routes (support/documents) to allow base64 attachments
const SUPPORT_JSON_LIMIT = process.env.SUPPORT_JSON_LIMIT || '20mb';
app.use('/api/support', express.json({ limit: SUPPORT_JSON_LIMIT }), supportRoutes);
const DOCUMENTS_JSON_LIMIT = process.env.DOCUMENTS_JSON_LIMIT || '25mb';
app.use('/api/documents', express.json({ limit: DOCUMENTS_JSON_LIMIT }), documentRoutes);

// Default JSON parser for the rest of the API
app.use(express.json());
app.use('/api/', rootRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/questionnaire', questionnaireRoutes);
app.use('/api/images', imagesRoutes);

// mongoose.connect(process.env.MONGO_URI)
//   .then(() => console.log('MongoDB connected'))
//   .catch(err => console.error(err));

const PORT = process.env.PORT || 3000;

async function checkDynamoConnectivity() {
	const region = process.env.AWS_REGION || 'eu-central-1';
	const client = new DynamoDBClient({ region });
	// Basic reachability
	await client.send(new ListTablesCommand({ Limit: 1 }));

	// Optionally verify required tables if provided
	const requiredTables = [
		process.env.DDB_USERS_TABLE,
		process.env.DDB_SUPPORT_TABLE
	].filter(Boolean);

	for (const tableName of requiredTables) {
		await client.send(new DescribeTableCommand({ TableName: tableName }));
	}
}

async function start() {
	try {
		await checkDynamoConnectivity();
		console.log('DynamoDB connectivity: OK');
	} catch (err) {
		console.error('DynamoDB connectivity: FAIL ->', err.message);
		process.exit(1);
	}

	app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

start();
