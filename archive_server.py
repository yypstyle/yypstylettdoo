"""
报关本机服务 — 手机 PWA 导出文件自动归档接收
独立于 ocr_server（无 Paddle 依赖，启动即用）。

启动: python archive_server.py    （默认端口 9001）
功能: 手机 PWA 导出 Excel 成功后自动 POST 到 /upload?name=文件名
      文件落盘到归档源目录 → 报关文件自动匹配系统定时扫描归档

注意: 归档源目录在 M: 映射盘上，请从桌面会话（PowerShell）启动本服务，
      不要用管理员/计划任务等其它会话启动（映射盘按会话隔离）。
"""

import os
import re
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# 归档源目录：自动匹配系统的扫描目录（正斜杠写法，避免转义问题）
UPLOAD_DIR = os.environ.get(
    'UPLOAD_DIR',
    'M:/聊天记录md/报关 讲稿_Qwenpaw一键🎨-82ada7035b_全部时间/media/files'
)
PORT = int(os.environ.get('PORT', '9001'))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('archive-server')

app = FastAPI(title='报关归档接收服务')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/')
@app.get('/health')
def health():
    return {'status': 'ok', 'upload_dir': UPLOAD_DIR, 'dir_exists': os.path.isdir(UPLOAD_DIR)}


@app.post('/upload')
async def upload(request: Request, name: str = 'file'):
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail='empty body')
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    safe = re.sub(r'[\\/:*?"<>|]', '_', name) or 'file.bin'
    path = os.path.join(UPLOAD_DIR, safe)
    # 同名不覆盖：自动加序号（两台手机交叉出车，同一车次可能在两台设备上导出）
    seq = 2
    while os.path.exists(path):
        root, ext = os.path.splitext(safe)
        path = os.path.join(UPLOAD_DIR, f'{root}({seq}){ext}')
        seq += 1
    with open(path, 'wb') as f:
        f.write(body)
    logger.info(f'归档接收: {path} ({len(body)} bytes)')
    return {'ok': True, 'saved': os.path.basename(path), 'size': len(body)}


if __name__ == '__main__':
    uvicorn.run(app, host='0.0.0.0', port=PORT)
