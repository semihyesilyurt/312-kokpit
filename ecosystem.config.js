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
      // Auto-restart configuration
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 5000,
      listen_timeout: 10000,
      // Logging
      error_file: '/www/wwwroot/312/kokpit/logs/api-error.log',
      out_file: '/www/wwwroot/312/kokpit/logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      // Health check
      wait_ready: true,
    },
    {
      name: 'kokpit-web',
      cwd: '/www/wwwroot/312/kokpit/apps/web/.next/standalone/apps/web',
      script: 'server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
      },
      // Auto-restart configuration
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 5000,
      listen_timeout: 10000,
      // Logging
      error_file: '/www/wwwroot/312/kokpit/logs/web-error.log',
      out_file: '/www/wwwroot/312/kokpit/logs/web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
