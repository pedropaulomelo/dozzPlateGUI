const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron'); // Importar nativeImage
const path = require('path');
const { fork } = require('child_process');
const axios = require('axios'); // Importar axios

let mainWindow;
let serverProcess;
let tray = null;
let isQuiting = false; // Adicionar variável isQuiting

const iconPath = path.join(__dirname, 'public', 'assets', 'logo.png');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true, // Considere as implicações de segurança
      contextIsolation: false,
    },
  });

  // Modificar o comportamento do fechamento da janela
  mainWindow.on('close', function (event) {
    if (!isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = fork(path.join(__dirname, 'server.js'));

    serverProcess.on('message', (message) => {
      if (message === 'server-started') {
        resolve();
      }
    });

    serverProcess.on('error', (err) => {
      console.error('Erro no servidor:', err);
      reject(err);
    });

    serverProcess.on('exit', (code, signal) => {
      console.log(`Servidor finalizado com código ${code} e sinal ${signal}`);
    });
  });
}

function createTray() {
  let trayIcon = nativeImage.createFromPath(iconPath);

  // Ajustar o ícone dependendo do sistema operacional
  if (process.platform === 'darwin') {
    // Para macOS, redimensionar e definir como template
    trayIcon = trayIcon.resize({ width: 21, height: 21 });
    trayIcon.setTemplateImage(true);
  } else if (process.platform === 'win32') {
    // Para Windows, redimensionar conforme necessário
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } else {
    // Para Linux ou outros sistemas
    trayIcon = trayIcon.resize({ width: 24, height: 24 });
  }

  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mostrar Aplicativo',
      click: function () {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createWindow();
        }
      },
    },
    {
      label: 'Sair',
      click: function () {
        isQuiting = true;
        if (serverProcess) {
          serverProcess.kill();
        }
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Nome do Seu Aplicativo');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow();
    }
  });
}

async function isServerRunning(port) {
  try {
    const response = await axios.get(`http://localhost:${port}/health-check`, { timeout: 2000 });
    if (response.status === 200) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

app.on('ready', async () => {
  try {
    const serverRunning = await isServerRunning(4000);

    if (!serverRunning) {
      // Servidor não está rodando, inicie-o
      await startServer();
    } else {
      console.log('Servidor já está rodando na porta 4000');
    }

    createWindow();
    createTray();

    // Carregue a interface
    mainWindow.loadURL('http://localhost:4000');
  } catch (err) {
    console.error('Falha ao iniciar o servidor:', err);
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  isQuiting = true;
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});