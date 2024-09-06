const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { Client } = require('pg');
require('dotenv').config();

console.log('Starting map_change_monitor.js');
console.log('NEON_DATABASE_URL:', process.env.NEON_DATABASE_URL);

function logConnectionDetails(url) {
    console.log('Full connection URL:', url);
    const mask = (str) => (str ? '*'.repeat(str.length) : 'null');

    try {
        const parsedUrl = new URL(url);
        console.log('Connection details:');
        console.log('  Protocol:', parsedUrl.protocol);
        console.log('  Username:', parsedUrl.username);
        console.log('  Password:', mask(parsedUrl.password));
        console.log('  Host:', parsedUrl.hostname);
        console.log('  Port:', parsedUrl.port);
        console.log('  Database:', parsedUrl.pathname.slice(1)); // Remove leading '/'
        console.log('  Search params:', parsedUrl.search);
    } catch (error) {
        console.error('Error parsing connection URL:', error.message);
    }
}

const connectionString = process.env.NEON_DATABASE_URL;
logConnectionDetails(connectionString);

const client = new Client({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});

let isProcessing = false;

async function connectToDatabase() {
    try {
        console.log('Attempting to connect to the database...');
        await client.connect();
        console.log('Connected to the database');
        // Log database version to confirm connection
        const res = await client.query('SELECT version()');
        console.log('Database version:', res.rows[0].version);
    } catch (err) {
        console.error('Error connecting to the database', err);
        process.exit(1);
    }
}

async function checkForQueuedMapChanges() {
    if (isProcessing) {
        console.log('Previous check still in progress. Skipping this cycle.');
        return;
    }

    isProcessing = true;
    console.log('Starting map change check cycle.');

    try {
        const nextWipeInfoQuery = `
            SELECT server_id, level_url
            FROM next_wipe_info
            WHERE is_queued = true
        `;
        console.log('Executing next_wipe_info query:', nextWipeInfoQuery);
        const nextWipeInfoResult = await client.query(nextWipeInfoQuery);

        console.log('next_wipe_info query result:', nextWipeInfoResult.rows);

        if (nextWipeInfoResult.rows.length === 0) {
            console.log('No servers found queued for map changes.');
            return;
        }

        console.log(`Found ${nextWipeInfoResult.rows.length} server(s) queued for map changes.`);

        for (const row of nextWipeInfoResult.rows) {
            const serverBackendInfoQuery = `
                SELECT server_folder
                FROM server_backend_info
                WHERE server_id = $1
            `;
            console.log('Executing server_backend_info query:', serverBackendInfoQuery);
            const serverBackendInfoResult = await client.query(serverBackendInfoQuery, [row.server_id]);

            console.log('server_backend_info query result:', serverBackendInfoResult.rows);

            if (serverBackendInfoResult.rows.length === 0) {
                console.error(`No server_folder found for server_id ${row.server_id} in server_backend_info table. Skipping this server.`);
                continue;
            }

            const serverFolder = serverBackendInfoResult.rows[0].server_folder;
            await updateMapForServer(row.server_id, row.level_url, serverFolder);
        }
    } catch (err) {
        console.error('Error checking for queued map changes:', err);
    } finally {
        isProcessing = false;
        console.log('Map change check cycle completed.');
    }
}

async function updateMapForServer(serverId, levelUrl, serverFolder) {
    const baseDir = '/home/amp/.ampdata/instances';
    const serverDir = path.join(baseDir, serverFolder);
    const filePath = path.join(serverDir, 'RustModule.kvp');

    console.log(`Updating map for server ${serverId}`);
    console.log(`Server folder: ${serverFolder}`);
    console.log(`Full server directory path: ${serverDir}`);
    console.log(`RustModule.kvp file path: ${filePath}`);
    console.log(`New level URL: ${levelUrl}`);

    try {
        // Check if the base directory exists
        await fs.access(baseDir);
        console.log(`Base directory ${baseDir} exists`);

        // Check if the server directory exists
        await fs.access(serverDir);
        console.log(`Server directory ${serverDir} exists`);

        // Check if the RustModule.kvp file exists
        await fs.access(filePath);
        console.log(`RustModule.kvp file exists at ${filePath}`);

        // Read the file
        console.log(`Reading file: ${filePath}`);
        let data = await fs.readFile(filePath, 'utf8');

        // Update the Rust.LevelUrl line
        const regex = /^Rust\.LevelUrl=.*/m;
        const oldLevelUrl = data.match(regex);
        console.log(`Current level URL: ${oldLevelUrl}`);

        data = data.replace(regex, `Rust.LevelUrl=${levelUrl}`);

        // Write the updated content back to the file
        console.log('Writing updated content to file');
        await fs.writeFile(filePath, data, 'utf8');

        // Verify the change
        console.log('Verifying the change');
        const updatedData = await fs.readFile(filePath, 'utf8');
        if (updatedData.includes(`Rust.LevelUrl=${levelUrl}`)) {
            console.log(`Successfully updated map for server ${serverId}`);

            // Wait for 5 seconds
            await new Promise((resolve) => setTimeout(resolve, 5000));

            // Restart the AMP instance
            console.log(`Restarting AMP instance for server folder: ${serverFolder}`);
            await restartAMPInstance(serverFolder);

            await updateQueueStatus(serverId, false);
        } else {
            console.error(`Failed to update map for server ${serverId}`);
            console.error('File content after update:');
            console.error(updatedData);
        }
    } catch (err) {
        console.error(`Error updating map for server ${serverId}:`, err);
        if (err.code === 'ENOENT') {
            console.error('File or directory not found. Please check the path and permissions.');
        }
    }
}

async function restartAMPInstance(serverFolder) {
    return new Promise((resolve, reject) => {
        const command = `sudo -u amp ampinstmgr -r "${serverFolder}"`;
        console.log(`Executing command: ${command}`);
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error restarting AMP instance: ${error}`);
                reject(error);
                return;
            }
            if (stderr) {
                console.error(`stderr: ${stderr}`);
            }
            console.log(`stdout: ${stdout}`);
            resolve();
        });
    });
}

async function updateQueueStatus(serverId, isQueued) {
    try {
        const query = `
            UPDATE next_wipe_info
            SET is_queued = $1
            WHERE server_id = $2
        `;
        console.log(`Executing query: ${query} with params [${isQueued}, ${serverId}]`);
        await client.query(query, [isQueued, serverId]);
        console.log(`Updated queue status for server ${serverId} to ${isQueued}`);
    } catch (err) {
        console.error(`Error updating queue status for server ${serverId}:`, err);
    }
}

async function main() {
    await connectToDatabase();

    // Run the check every 15 seconds
    console.log('Starting interval to check for queued map changes every 15 seconds');
    setInterval(checkForQueuedMapChanges, 15000);
}

main().catch(console.error);
