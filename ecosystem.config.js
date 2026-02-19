module.exports = {
  apps: [
    {
      name: 'midnight-station',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: './',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3030,
      },
    },
  ],
};
