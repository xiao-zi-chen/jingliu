import { createApp } from './app.mjs';

const {app,close}=createApp();
const port=Number(process.env.PORT||4174);
const host=process.env.HOST||'127.0.0.1';
const server=app.listen(port,host,()=>console.log(`镜留服务已启动 http://${host}:${port}`));
function shutdown(){server.close(()=>{close();process.exit(0);});}
process.on('SIGINT',shutdown);
process.on('SIGTERM',shutdown);
