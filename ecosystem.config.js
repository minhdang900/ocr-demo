module.exports = {
  apps: [
    {
      name: 'xtracta-web',
      cwd: './apps/web',
      script: 'pnpm',
      args: 'dev',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      log_file: '../logs/web.log',
      out_file: '../logs/web-out.log',
      error_file: '../logs/web-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'xtracta-gateway',
      cwd: './apps/gateway',
      script: 'pnpm',
      args: 'dev',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        OCR_SERVICE_HOST: 'localhost',
        OCR_SERVICE_PORT: 8001
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      log_file: '../logs/gateway.log',
      out_file: '../logs/gateway-out.log',
      error_file: '../logs/gateway-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'xtracta-ocr',
      cwd: './services/ocr',
      script: './start_server.sh',
      env: {
        PYTHONPATH: './',
        HTTP_HOST: '0.0.0.0',
        HTTP_PORT: 8001
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      log_file: '../logs/ocr.log',
      out_file: '../logs/ocr-out.log',
      error_file: '../logs/ocr-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
