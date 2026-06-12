/**
 * PM2 config for Windows till local-agent.
 * install-agent.ps1 overwrites this at deploy time with till-specific paths.
 */
const installRoot = (process.env.VENUE_POS_INSTALL_ROOT || 'C:/Venue_POS').replace(/\\/g, '/');
const agentRoot = (process.env.VENUE_POS_AGENT_ROOT || `${installRoot}/local-agent`).replace(/\\/g, '/');
const pm2Home = (process.env.PM2_HOME || `${installRoot}/data/pm2`).replace(/\\/g, '/');

module.exports = {
  apps: [
    {
      name: 'venue-pos-agent',
      script: 'src/index.js',
      cwd: agentRoot,
      interpreter: 'node',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
      env: {
        NODE_ENV: 'production',
        PM2_HOME: pm2Home,
        VENUE_POS_AGENT_ROOT: agentRoot,
        VENUE_POS_INSTALL_ROOT: installRoot,
      },
    },
  ],
};
