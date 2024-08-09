# Amp Map Update

This Node.js script monitors for queued map updates and edits the RustModule.kvp file to set the map to be changed on next restart.

## Prerequisites

### Installing Node.js and npm on Ubuntu

1. Update your package list:

    ```
    sudo apt update
    ```

2. Install Node.js and npm:

    ```
    sudo apt install nodejs npm
    ```

3. Verify the installation:

    ```
    node --version
    npm --version
    ```

    If you need a specific version of Node.js, consider using nvm (Node Version Manager):

4. Install nvm:

    ```
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
    ```

5. Restart your terminal or run:

    ```
    source ~/.bashrc
    ```

6. Install and use a specific Node.js version (e.g., 18.x):
    ```
    nvm install 18
    nvm use 18
    ```

## Setup

1. Create the scripts directory and clone the repository:

    ```
    sudo mkdir -p /opt/scripts
    sudo chown amp:amp /opt/scripts
    cd /opt/scripts
    git clone https://github.com/tsmith165/amp-map-update.git
    cd amp-map-update
    ```

2. Install dependencies:

    ```
    npm install
    ```

3. Copy `.env.example` to `.env` and fill in your database URL:

    ```
    cp .env.example .env
    nano .env
    ```

4. Edit the `.env` file with your actual database URL.

## Running the Script

To run the script manually:

```
node map_change_monitor.js
```

## Setting up as a System Service

To run the script as a system service that starts on boot and restarts on failure:

1. Create the service file:

    ```
    sudo nano /etc/systemd/system/map-change-monitor.service
    ```

2. Add the following content to the service file:

    ```
    [Unit]
    Description=Map Change Monitor
    After=network.target

    [Service]
    ExecStart=/usr/bin/node /opt/scripts/amp-map-update/map_change_monitor.js
    Restart=always
    User=amp
    Environment=PATH=/usr/bin:/usr/local/bin
    Environment=NODE_ENV=production
    WorkingDirectory=/opt/scripts/amp-map-update

    [Install]
    WantedBy=multi-user.target
    ```

3. Save and close the file.

4. Set the correct permissions for the script directory:

    ```
    sudo chown -R amp:amp /opt/scripts/amp-map-update
    ```

5. Reload the systemd daemon:

    ```
    sudo systemctl daemon-reload
    ```

6. Enable and start the service:

    ```
    sudo systemctl enable map-change-monitor.service
    sudo systemctl start map-change-monitor.service
    ```

7. Check the status of the service:
    ```
    sudo systemctl status map-change-monitor.service
    ```

## Viewing Logs

To view the logs of the service:

```
sudo journalctl -u map-change-monitor -f
```

This will show you the live logs. Press Ctrl+C to exit.

## Troubleshooting

If you encounter any issues:

1. Check the logs for any error messages:

    ```
    sudo journalctl -u map-change-monitor -e
    ```

2. Ensure all file permissions are correct:

    ```
    sudo chown -R amp:amp /opt/scripts/amp-map-update
    ```

3. Verify that the .env file contains the correct database URL.

4. Make sure Node.js and npm are installed correctly and accessible to the amp user.

## License

This project is licensed under the MIT License.
