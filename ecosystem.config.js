module.exports = {
  apps: [
    {
      name: "my-next-app",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 1995",
      cwd: "./",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    }
  ],

//   apps: [
//     // First application
//     {
//       name: 'SSR',
//       script: 'server.js',
//       instances: 0,
//       exec_mode: 'cluster',
//       env: {},
//       env_production: {
//         NODE_ENV: 'production',
//       },
//     },
//   ],

  /**
   * Deployment section
   * http://pm2.keymetrics.io/docs/usage/deployment/
   */
  deploy: {
    production: {
      user: 'cc',
      host: ['10.1.12.221'],
      ref: 'origin/main',
      repo: 'git@github.com:netfull95/nf-blog.git',
      path: '/home/cc/nf-blog',
      'post-deploy': 'next start -p 1995',
      ssh_options: ['ForwardAgent=yes']
    },
  }
}
