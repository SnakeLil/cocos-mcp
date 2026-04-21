export function getEditor(): any {
  return (global as any).Editor;
}

export function callSceneScript(method: string, ...args: any[]): Promise<any> {
  const Editor = getEditor();
  if (!Editor) {
    return Promise.reject(new Error('Editor global is unavailable'));
  }

  if (Editor.Scene && typeof Editor.Scene.callSceneScript === 'function') {
    return new Promise((resolve, reject) => {
      const callback = (err: Error | null, result: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      };
      Editor.Scene.callSceneScript('cocos-mcp', method, ...args, callback);
    });
  }

  if (Editor.Message && typeof Editor.Message.request === 'function') {
    return Editor.Message.request('scene', 'execute-scene-script', {
      name: 'cocos-mcp',
      method,
      args,
    });
  }

  return Promise.reject(new Error('No supported scene-script bridge available'));
}

export async function tryIpcMessages(candidates: Array<() => Promise<any>>): Promise<any> {
  let lastError: any;
  for (const candidate of candidates) {
    try {
      return await candidate();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No IPC method succeeded');
}
