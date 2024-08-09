const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});

async function connectToDatabase() {
    try {
        await client.connect();
        console.log('Connected to the database');
    } catch (err) {
        console.error('Error connecting to the database', err);
        process.exit(1);
    }
}

async function checkForQueuedMapChanges() {
    try {
        const query = `
            SELECT nwi.server_id, nwi.level_url, sbi.server_folder
            FROM next_wipe_info nwi
            JOIN server_backend_info sbi ON nwi.server_id = sbi.server_id
            WHERE nwi.is_queued = true
        `;
        const result = await client.query(query);

        if (result.rows.length === 0) {
            console.log('No servers found queued for map changes.');
            return;
        }

        console.log(`Found ${result.rows.length} server(s) queued for map changes.`);

        for (const row of result.rows) {
            await updateMapForServer(row.server_id, row.level_url, row.server_folder);
        }
    } catch (err) {
        console.error('Error checking for queued map changes:', err);
    }
}

async function updateMapForServer(serverId, levelUrl, serverFolder) {
    const filePath = `/home/amp/.ampdata/instances/${serverFolder}/RustModule.kvp`;

    console.log(`Updating map for server ${serverId}`);
    console.log(`Server folder: ${serverFolder}`);
    console.log(`New level URL: ${levelUrl}`);

    try {
        // Read the file
        console.log(`Reading file: ${filePath}`);
        let data = await fs.promises.readFile(filePath, 'utf8');

        // Update the Rust.LevelUrl line
        const regex = /^Rust\.LevelUrl=.*/m;
        const oldLevelUrl = data.match(regex);
        console.log(`Current level URL: ${oldLevelUrl}`);

        data = data.replace(regex, `Rust.LevelUrl=${levelUrl}`);

        // Write the updated content back to the file
        console.log('Writing updated content to file');
        await fs.promises.writeFile(filePath, data, 'utf8');

        // Verify the change
        console.log('Verifying the change');
        const updatedData = await fs.promises.readFile(filePath, 'utf8');
        if (updatedData.includes(`Rust.LevelUrl=${levelUrl}`)) {
            console.log(`Successfully updated map for server ${serverId}`);
            await updateQueueStatus(serverId, false);
        } else {
            console.error(`Failed to update map for server ${serverId}`);
            console.error('File content after update:');
            console.error(updatedData);
        }
    } catch (err) {
        console.error(`Error updating map for server ${serverId}:`, err);
    }
}

async function updateQueueStatus(serverId, isQueued) {
    try {
        const query = `
            UPDATE next_wipe_info
            SET is_queued = $1
            WHERE server_id = $2
        `;
        await client.query(query, [isQueued, serverId]);
        console.log(`Updated queue status for server ${serverId} to ${isQueued}`);
    } catch (err) {
        console.error(`Error updating queue status for server ${serverId}:`, err);
    }
}

async function main() {
    await connectToDatabase();

    console.log('Starting map change monitor');
    // Run the check every 15 seconds
    setInterval(async () => {
        console.log('Checking for queued map changes...');
        await checkForQueuedMapChanges();
    }, 15000);
}

main().catch(console.error);
