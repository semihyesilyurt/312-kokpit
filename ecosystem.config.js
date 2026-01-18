module.exports = {
  apps: [
    {
      name: 'kokpit-api',
      cwd: '/www/wwwroot/312/kokpit/apps/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: '/www/wwwroot/312/kokpit/logs/api-error.log',
      out_file: '/www/wwwroot/312/kokpit/logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '500M',
      watch: false,
    },
    {
      name: 'kokpit-web',
      cwd: '/www/wwwroot/312/kokpit/apps/web/.next/standalone/apps/web',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/www/wwwroot/312/kokpit/logs/web-error.log',
      out_file: '/www/wwwroot/312/kokpit/logs/web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '500M',
      watch: false,
    },
  ],
};
