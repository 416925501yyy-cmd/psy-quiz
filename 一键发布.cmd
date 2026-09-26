@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 心理学刷题 · 发布到网上

echo.
echo ================================================
echo   心理学刷题 · 一键发布到 GitHub Pages
echo ================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] 没有找到 Node.js，请先安装：https://nodejs.org
  echo     装完关掉这个窗口，再双击一次。
  echo.
  pause
  exit /b 1
)

echo [1/3] 检查题库并打包...
call npm run build
if errorlevel 1 (
  echo.
  echo [X] 打包失败，把上面的报错发给我看看。
  pause
  exit /b 1
)

echo.
echo [2/3] 准备上传（下一步需要粘贴 GitHub 令牌）
echo.
node tools/publish.mjs %*

echo.
echo [3/3] 结束。上面绿色的网址就是给她的地址。
echo.
pause
