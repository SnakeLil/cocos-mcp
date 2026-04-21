'use strict';

Editor.Panel.extend({
  style: `
    :host {
      display: flex;
      flex-direction: column;
      padding: 12px;
      color: #d7dde5;
      background: linear-gradient(180deg, #1f2937 0%, #111827 100%);
      font-family: Helvetica, Arial, sans-serif;
    }

    h2 {
      margin: 0 0 12px;
      font-size: 18px;
      color: #f9fafb;
    }

    .card {
      padding: 12px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
      margin-bottom: 10px;
    }

    .row {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }

    button {
      flex: 1;
      border: 0;
      border-radius: 8px;
      padding: 8px 10px;
      background: #2563eb;
      color: white;
      cursor: pointer;
    }

    button.secondary {
      background: #374151;
    }

    input {
      width: 100%;
      box-sizing: border-box;
      border-radius: 8px;
      border: 1px solid #4b5563;
      background: #0f172a;
      color: #f9fafb;
      padding: 8px 10px;
      margin-top: 6px;
    }

    pre {
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 12px;
      line-height: 1.5;
      color: #cbd5e1;
      max-height: 260px;
      overflow: auto;
    }
  `,

  template: `
    <h2>Cocos MCP 2.x</h2>
    <div class="card">
      <div>Port</div>
      <input id="port" type="number" min="1" max="65535" />
      <div class="row">
        <button id="start">Start</button>
        <button id="stop" class="secondary">Stop</button>
      </div>
    </div>
    <div class="card">
      <div>Status</div>
      <pre id="status">Loading...</pre>
    </div>
  `,

  $: {
    port: '#port',
    start: '#start',
    stop: '#stop',
    status: '#status',
  },

  ready() {
    this.refresh();
    this.$start.addEventListener('click', () => this.startServer());
    this.$stop.addEventListener('click', () => this.stopServer());
    this.$port.addEventListener('change', () => this.updateSettings());
  },

  refresh() {
    Editor.Ipc.sendToMain('cocos-mcp:get-server-status', (error, result) => {
      if (error) {
        this.$status.textContent = String(error);
        return;
      }
      this.$port.value = result.settings.port;
      this.$status.textContent = JSON.stringify(result, null, 2);
    });
  },

  startServer() {
    this.updateSettings(() => {
      Editor.Ipc.sendToMain('cocos-mcp:start-server', () => this.refresh());
    });
  },

  stopServer() {
    Editor.Ipc.sendToMain('cocos-mcp:stop-server', () => this.refresh());
  },

  updateSettings(callback) {
    const port = Number(this.$port.value || 3100);
    Editor.Ipc.sendToMain('cocos-mcp:update-settings', { port }, () => {
      if (callback) {
        callback();
      }
      this.refresh();
    });
  },
});
