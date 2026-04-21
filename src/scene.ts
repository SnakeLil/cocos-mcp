import * as path from 'path';

declare const Editor: any;
declare const cc: any;

type VecLike = { x?: number; y?: number; z?: number };
type SerializedAssetRef = {
  __type__: 'cc.AssetRef';
  assetType?: string;
  uuid: string | null;
  name?: string;
};
type PropertyValueRef = Record<string, any>;

function success(data?: any, message?: string) {
  return { success: true, data, message };
}

function failure(error: any) {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

function withReply(fn: (...args: any[]) => any) {
  return function wrapped(eventOrArg?: any, ...rest: any[]) {
    const hasEvent = eventOrArg && typeof eventOrArg.reply === 'function';
    const args = hasEvent ? rest : [eventOrArg, ...rest];

    try {
      const result = fn(...args);
      if (result && typeof result.then === 'function') {
        return result
          .then((resolved: any) => {
            if (hasEvent) {
              eventOrArg.reply(null, resolved);
            }
            return resolved;
          })
          .catch((error: any) => {
            const failed = failure(error);
            if (hasEvent) {
              eventOrArg.reply(failed.error);
            }
            return failed;
          });
      }
      if (hasEvent) {
        eventOrArg.reply(null, result);
      }
      return result;
    } catch (error) {
      const result = failure(error);
      if (hasEvent) {
        eventOrArg.reply(result.error);
      }
      return result;
    }
  };
}

function getSceneRoot(): any {
  const scene = cc.director && cc.director.getScene ? cc.director.getScene() : null;
  if (!scene) {
    throw new Error('No active scene');
  }
  return scene;
}

function traverse(node: any, visitor: (node: any) => void): void {
  visitor(node);
  const children = node.children || [];
  children.forEach((child: any) => traverse(child, visitor));
}

function findNodeByUuid(uuid: string): any | null {
  const scene = getSceneRoot();
  if (scene.uuid === uuid) {
    return scene;
  }

  let found: any = null;
  traverse(scene, (node) => {
    if (!found && node.uuid === uuid) {
      found = node;
    }
  });
  return found;
}

function findNodesByName(pattern: string, exactMatch = false): any[] {
  const scene = getSceneRoot();
  const result: any[] = [];
  traverse(scene, (node) => {
    if (exactMatch ? node.name === pattern : String(node.name || '').includes(pattern)) {
      result.push(node);
    }
  });
  return result;
}

function getClassName(target: any): string {
  return (cc.js && cc.js.getClassName && cc.js.getClassName(target)) || target?.__classname__ || target?.constructor?.name || 'Unknown';
}

function isCocosNode(value: any): boolean {
  return !!(value && value.uuid && Array.isArray(value.children));
}

function isCocosComponent(value: any): boolean {
  return !!(value && value.node && value.uuid && !Array.isArray(value.children));
}

function isCocosAsset(value: any): boolean {
  return !!(value && typeof value === 'object' && (value instanceof cc.Asset || value._uuid || value.uuid) && !value.node);
}

function serializeAsset(value: any): SerializedAssetRef {
  return {
    __type__: 'cc.AssetRef',
    assetType: getClassName(value),
    uuid: value?._uuid || value?.uuid || null,
    name: value?.name,
  };
}

function serializeValue(value: any, depth = 0, seen = new WeakSet<object>()): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'function') {
    return '[Function]';
  }

  if (Array.isArray(value)) {
    if (depth >= 4) {
      return `[Array(${value.length})]`;
    }
    return value.slice(0, 50).map((item) => serializeValue(item, depth + 1, seen));
  }

  if (typeof value === 'object') {
    if (isCocosNode(value)) {
      return {
        uuid: value.uuid,
        name: value.name,
        __type__: getClassName(value),
      };
    }

    if (isCocosComponent(value)) {
      return {
        uuid: value.uuid,
        type: getClassName(value),
        nodeUuid: value.node?.uuid || null,
        nodeName: value.node?.name || null,
        __type__: 'cc.ComponentRef',
      };
    }

    if (isCocosAsset(value)) {
      return serializeAsset(value);
    }

    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    if (depth >= 4) {
      return `[Object ${getClassName(value)}]`;
    }

    const result: Record<string, any> = {};
    Object.keys(value).slice(0, 80).forEach((key) => {
      const current = value[key];
      if (typeof current !== 'function') {
        result[key] = serializeValue(current, depth + 1, seen);
      }
    });
    return result;
  }

  return value;
}

function getNodePath(node: any): string {
  const parts: string[] = [];
  let current = node;
  while (current) {
    parts.unshift(current.name || 'Unnamed');
    current = current.parent;
  }
  return parts.join('/');
}

function serializeComponent(component: any): any {
  const type = getClassName(component);
  const properties: Record<string, any> = {};
  const relevantKeys = new Set<string>([
    ...Object.keys(component),
    ...(component.__props__ || []),
  ]);

  Array.from(relevantKeys).forEach((key) => {
    if (!key || key === 'node' || key === '_name' || key === '_id' || key === '_enabled' || key === '__scriptAsset') {
      return;
    }
    if (key.startsWith('__')) {
      return;
    }
    const value = component[key];
    if (typeof value !== 'function') {
      properties[key] = serializeValue(value);
    }
  });
  return {
    uuid: component.uuid,
    type,
    enabled: component.enabled !== false,
    nodeUuid: component.node?.uuid || null,
    properties,
  };
}

function serializeNode(node: any, includeComponents = true): any {
  const position = node.position || node.getPosition?.() || { x: 0, y: 0, z: 0 };
  const scale = node.scale || { x: node.scaleX || 1, y: node.scaleY || 1, z: 1 };
  return {
    uuid: node.uuid,
    name: node.name,
    active: node.active,
    path: getNodePath(node),
    parentUuid: node.parent ? node.parent.uuid : null,
    childCount: (node.children || []).length,
    children: (node.children || []).map((child: any) => serializeNode(child, includeComponents)),
    position: { x: position.x || 0, y: position.y || 0, z: position.z || 0 },
    rotation: {
      x: node.rotationX || 0,
      y: node.rotationY || 0,
      z: node.angle || 0,
    },
    scale: { x: scale.x || 1, y: scale.y || 1, z: scale.z || 1 },
    components: includeComponents ? (node._components || []).map((component: any) => serializeComponent(component)) : undefined,
  };
}

function resolveParent(parentUuid?: string): any {
  if (!parentUuid) {
    return getSceneRoot();
  }
  const node = findNodeByUuid(parentUuid);
  if (!node) {
    throw new Error(`Parent node not found: ${parentUuid}`);
  }
  return node;
}

function setPosition(node: any, position?: VecLike): void {
  if (!position) {
    return;
  }
  if (node.setPosition) {
    node.setPosition(position.x || 0, position.y || 0);
  } else {
    node.x = position.x || 0;
    node.y = position.y || 0;
  }
  if ('z' in position) {
    node.z = position.z || 0;
  }
}

function setScale(node: any, scale?: VecLike): void {
  if (!scale) {
    return;
  }
  if (scale.x !== undefined) {
    node.scaleX = scale.x;
  }
  if (scale.y !== undefined) {
    node.scaleY = scale.y;
  }
  if (scale.z !== undefined) {
    node.scaleZ = scale.z;
  }
}

function setRotation(node: any, rotation?: VecLike): void {
  if (!rotation) {
    return;
  }
  if (rotation.z !== undefined) {
    node.angle = rotation.z;
  }
  if (rotation.x !== undefined) {
    node.rotationX = rotation.x;
  }
  if (rotation.y !== undefined) {
    node.rotationY = rotation.y;
  }
}

function getComponentClass(componentType: string): any {
  if (!componentType) {
    throw new Error('componentType is required');
  }

  if (cc.js && typeof cc.js.getClassByName === 'function') {
    const byName = cc.js.getClassByName(componentType);
    if (byName) {
      return byName;
    }
  }

  const shortName = componentType.replace(/^cc\./, '');
  if (cc[shortName]) {
    return cc[shortName];
  }

  throw new Error(`Component type not found: ${componentType}`);
}

function getComponentOnNode(node: any, componentType: string): any {
  const direct = node.getComponent(componentType);
  if (direct) {
    return direct;
  }
  const cls = getComponentClass(componentType);
  return node.getComponent(cls);
}

function resolvePropertyTarget(root: any, property: string): { target: any; key: string } {
  if (property.includes('.')) {
    const parts = property.split('.');
    let current = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      if (current[key] == null) {
        current[key] = {};
      }
      current = current[key];
    }
    return {
      target: current,
      key: parts[parts.length - 1],
    };
  }
  return {
    target: root,
    key: property,
  };
}

function getAssetClass(assetType?: string): any {
  if (!assetType) {
    return null;
  }
  if (assetType.startsWith('cc.')) {
    return cc[assetType.slice(3)] || null;
  }
  return cc[assetType] || (cc.js && cc.js.getClassByName ? cc.js.getClassByName(assetType) : null);
}

function loadAssetByUuid(uuid: string, assetType?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!uuid) {
      reject(new Error('uuid is required'));
      return;
    }

    const done = (err: any, asset: any) => {
      if (err) {
        reject(err);
        return;
      }
      if (!asset) {
        reject(new Error(`Asset not found for uuid: ${uuid}`));
        return;
      }
      resolve(asset);
    };

    const expectedClass = getAssetClass(assetType);

    if (cc.assetManager && typeof cc.assetManager.loadAny === 'function') {
      cc.assetManager.loadAny({ uuid }, done);
      return;
    }

    if (cc.loader && typeof cc.loader.loadResUuid === 'function') {
      cc.loader.loadResUuid(uuid, expectedClass, done);
      return;
    }

    reject(new Error('No supported asset loading API available'));
  });
}

async function normalizePropertyValue(rawValue: any, expectedCurrentValue?: any): Promise<any> {
  if (Array.isArray(rawValue)) {
    return Promise.all(rawValue.map((item, index) => normalizePropertyValue(item, Array.isArray(expectedCurrentValue) ? expectedCurrentValue[index] : undefined)));
  }

  if (!rawValue || typeof rawValue !== 'object') {
    return rawValue;
  }

  const refValue = rawValue as PropertyValueRef;

  if (refValue.__type__ === 'cc.AssetRef' || refValue.type === 'asset_uuid') {
    return loadAssetByUuid(refValue.uuid, refValue.assetType);
  }

  if (refValue.type === 'node_uuid') {
    const node = findNodeByUuid(refValue.uuid);
    if (!node) {
      throw new Error(`Node not found: ${refValue.uuid}`);
    }
    return node;
  }

  if (refValue.type === 'component_ref') {
    const node = findNodeByUuid(refValue.nodeUuid);
    if (!node) {
      throw new Error(`Node not found: ${refValue.nodeUuid}`);
    }
    return getComponentOnNode(node, refValue.componentType);
  }

  if ((rawValue as any).__uuid__ && expectedCurrentValue && isCocosAsset(expectedCurrentValue)) {
    return loadAssetByUuid((rawValue as any).__uuid__, getClassName(expectedCurrentValue));
  }

  if ((rawValue as any).__uuid__ && (rawValue as any).__expectedAssetType) {
    return loadAssetByUuid((rawValue as any).__uuid__, (rawValue as any).__expectedAssetType);
  }

  const result: Record<string, any> = Array.isArray(rawValue) ? [] : {};
  const keys = Object.keys(rawValue);
  for (const key of keys) {
    result[key] = await normalizePropertyValue(rawValue[key], expectedCurrentValue ? expectedCurrentValue[key] : undefined);
  }
  return result;
}

async function setComponentPropertyValue(component: any, property: string, value: any): Promise<any> {
  const { target, key } = resolvePropertyTarget(component, property);
  const normalized = await normalizePropertyValue(value, target ? target[key] : undefined);
  target[key] = normalized;
  return normalized;
}

function applyNodeExtraProps(node: any, args: any): void {
  if (!args) {
    return;
  }

  if (args.active !== undefined) {
    node.active = !!args.active;
  }
  if (args.anchor && node.setAnchorPoint) {
    node.setAnchorPoint(args.anchor.x ?? 0.5, args.anchor.y ?? 0.5);
  }
  if (args.size && node.setContentSize) {
    node.setContentSize(args.size.width || 0, args.size.height || 0);
  }
}

async function assignSpriteFrame(nodeUuid: string, spriteFrameUuid: string, sizeMode?: string): Promise<any> {
  const node = findNodeByUuid(nodeUuid);
  if (!node) {
    throw new Error(`Node not found: ${nodeUuid}`);
  }
  const sprite = node.getComponent(cc.Sprite) || node.addComponent(cc.Sprite);
  const spriteFrame = await loadAssetByUuid(spriteFrameUuid, 'cc.SpriteFrame');
  sprite.spriteFrame = spriteFrame;

  if (sizeMode && cc.Sprite && cc.Sprite.SizeMode && cc.Sprite.SizeMode[sizeMode] !== undefined) {
    sprite.sizeMode = cc.Sprite.SizeMode[sizeMode];
  }

  return serializeComponent(sprite);
}

async function bindComponentAsset(args: any): Promise<any> {
  if (!args || !args.nodeUuid || !args.componentType || !args.property || !args.assetUuid) {
    throw new Error('nodeUuid, componentType, property and assetUuid are required');
  }
  const node = findNodeByUuid(args.nodeUuid);
  if (!node) {
    throw new Error(`Node not found: ${args.nodeUuid}`);
  }
  const component = getComponentOnNode(node, args.componentType);
  if (!component) {
    throw new Error(`Component not found: ${args.componentType}`);
  }
  const asset = await loadAssetByUuid(args.assetUuid, args.assetType);
  const { target, key } = resolvePropertyTarget(component, args.property);
  target[key] = asset;
  return serializeComponent(component);
}

async function applySceneResourceBindings(bindings: any[]): Promise<any[]> {
  const results: any[] = [];
  for (const binding of bindings || []) {
    if (!binding || !binding.kind) {
      results.push({ success: false, error: 'binding.kind is required', binding });
      continue;
    }
    try {
      switch (binding.kind) {
        case 'sprite_frame': {
          const spriteResult = await assignSpriteFrame(binding.nodeUuid, binding.spriteFrameUuid, binding.sizeMode);
          const node = findNodeByUuid(binding.nodeUuid);
          if (node) {
            if (binding.active !== undefined) {
              node.active = !!binding.active;
            }
            if (binding.position) {
              setPosition(node, binding.position);
            }
            if (binding.size && node.setContentSize) {
              node.setContentSize(binding.size.width || 0, binding.size.height || 0);
            }
          }
          results.push({ success: true, kind: binding.kind, result: spriteResult });
          break;
        }
        case 'component_asset': {
          const componentResult = await bindComponentAsset(binding);
          results.push({ success: true, kind: binding.kind, result: componentResult });
          break;
        }
        default:
          results.push({ success: false, kind: binding.kind, error: `Unsupported binding kind: ${binding.kind}` });
      }
    } catch (error: any) {
      results.push({
        success: false,
        kind: binding.kind,
        error: error.message || String(error),
      });
    }
  }
  return results;
}

function getCurrentSceneUrl(): string | null {
  const scene = getSceneRoot();
  const editorScene = Editor?.scene;
  if (editorScene?.path) {
    return editorScene.path;
  }
  if (editorScene?.url) {
    return editorScene.url;
  }
  if (scene && scene._id && Editor?.assetdb?.uuidToUrl) {
    try {
      return Editor.assetdb.uuidToUrl(scene._id);
    } catch (error) {
      // ignore and continue to other query methods
    }
  }
  if (scene && scene._id && Editor?.assetdb?.queryUrlByUuid) {
    try {
      return Editor.assetdb.queryUrlByUuid(scene._id);
    } catch (error) {
      // ignore and continue
    }
  }
  if (scene && scene._id && Editor?.assetdb?.queryPathByUuid) {
    try {
      const pathValue = Editor.assetdb.queryPathByUuid(scene._id);
      if (pathValue) {
        return String(pathValue).startsWith('db://') ? pathValue : `db://assets/${path.basename(pathValue)}`;
      }
    } catch (error) {
      // ignore and continue
    }
  }
  return null;
}

function serializeCurrentSceneAsset(): { sceneUrl: string; content: string } {
  const scene = getSceneRoot();
  const sceneUrl = getCurrentSceneUrl();
  if (!sceneUrl) {
    throw new Error('Current scene URL is unavailable');
  }
  if (!Editor?.serialize) {
    throw new Error('Editor.serialize is unavailable');
  }
  const asset = new cc.SceneAsset();
  asset.scene = scene;
  return {
    sceneUrl,
    content: Editor.serialize(asset),
  };
}

function createOrSaveAsset(assetUrl: string, content: string): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!Editor?.assetdb?.createOrSave) {
      reject(new Error('Editor.assetdb.createOrSave is unavailable'));
      return;
    }
    Editor.assetdb.createOrSave(assetUrl, content, (err: any, result: any) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result || null);
    });
  });
}

function createSceneAsset(sceneName: string): any {
  const scene = new cc.Scene();
  scene.name = sceneName;
  return scene;
}

function createNodeSnapshot(node: any): any {
  if (!cc.instantiate) {
    throw new Error('cc.instantiate is unavailable');
  }
  return cc.instantiate(node);
}

const handlers = {
  getCurrentSceneInfo: withReply(function getCurrentSceneInfo() {
    try {
      const scene = getSceneRoot();
      return success({
        name: scene.name,
        uuid: scene.uuid,
        path: getCurrentSceneUrl() || '',
        childCount: (scene.children || []).length,
      });
    } catch (error) {
      return failure(error);
    }
  }),

  getSceneHierarchy: withReply(function getSceneHierarchy(includeComponents = false) {
    try {
      const scene = getSceneRoot();
      return success(serializeNode(scene, includeComponents));
    } catch (error) {
      return failure(error);
    }
  }),

  getAllNodes: withReply(function getAllNodes(includeComponents = false) {
    try {
      const scene = getSceneRoot();
      const nodes: any[] = [];
      traverse(scene, (node) => {
        nodes.push(serializeNode(node, includeComponents));
      });
      return success(nodes);
    } catch (error) {
      return failure(error);
    }
  }),

  findNodes: withReply(function findNodes(pattern: string, exactMatch = false, includeComponents = false) {
    try {
      const nodes = findNodesByName(pattern, exactMatch).map((node) => serializeNode(node, includeComponents));
      return success(nodes);
    } catch (error) {
      return failure(error);
    }
  }),

  getNodeInfo: withReply(function getNodeInfo(uuid: string, includeComponents = true) {
    try {
      const node = findNodeByUuid(uuid);
      if (!node) {
        throw new Error(`Node not found: ${uuid}`);
      }
      return success(serializeNode(node, includeComponents));
    } catch (error) {
      return failure(error);
    }
  }),

  createNode: withReply(function createNode(args: any) {
    try {
      const parent = resolveParent(args.parentUuid);
      const node = new cc.Node(args.name || 'New Node');
      parent.addChild(node);

      if (typeof args.siblingIndex === 'number' && args.siblingIndex >= 0) {
        node.setSiblingIndex(args.siblingIndex);
      }

      setPosition(node, args.initialTransform?.position);
      setRotation(node, args.initialTransform?.rotation);
      setScale(node, args.initialTransform?.scale);
      applyNodeExtraProps(node, args.initialTransform);

      const components = Array.isArray(args.components) ? args.components : [];
      components.forEach((componentType: string) => {
        const cls = getComponentClass(componentType);
        node.addComponent(cls);
      });

      return success(serializeNode(node, true), `Node created: ${node.name}`);
    } catch (error) {
      return failure(error);
    }
  }),

  deleteNode: withReply(function deleteNode(uuid: string) {
    try {
      const node = findNodeByUuid(uuid);
      if (!node) {
        throw new Error(`Node not found: ${uuid}`);
      }
      if (!node.parent) {
        throw new Error('Cannot delete root scene node');
      }
      node.removeFromParent(false);
      node.destroy();
      return success({ uuid }, 'Node deleted');
    } catch (error) {
      return failure(error);
    }
  }),

  moveNode: withReply(function moveNode(nodeUuid: string, newParentUuid: string, siblingIndex = -1) {
    try {
      const node = findNodeByUuid(nodeUuid);
      const parent = resolveParent(newParentUuid);
      if (!node) {
        throw new Error(`Node not found: ${nodeUuid}`);
      }
      parent.addChild(node);
      if (typeof siblingIndex === 'number' && siblingIndex >= 0) {
        node.setSiblingIndex(siblingIndex);
      }
      return success(serializeNode(node, false), 'Node moved');
    } catch (error) {
      return failure(error);
    }
  }),

  duplicateNode: withReply(function duplicateNode(uuid: string, parentUuid?: string, includeChildren = true) {
    try {
      const node = findNodeByUuid(uuid);
      if (!node) {
        throw new Error(`Node not found: ${uuid}`);
      }
      let clone: any;
      if (includeChildren) {
        clone = createNodeSnapshot(node);
      } else {
        clone = new cc.Node(`${node.name}_copy`);
        setPosition(clone, { x: node.x, y: node.y, z: node.z });
        setRotation(clone, { x: node.rotationX, y: node.rotationY, z: node.angle });
        setScale(clone, { x: node.scaleX, y: node.scaleY, z: node.scaleZ });
      }
      resolveParent(parentUuid || node.parent?.uuid).addChild(clone);
      clone.name = `${node.name}_copy`;
      return success(serializeNode(clone, true), 'Node duplicated');
    } catch (error) {
      return failure(error);
    }
  }),

  setNodeProperty: withReply(function setNodeProperty(uuid: string, property: string, value: any) {
    try {
      const node = findNodeByUuid(uuid);
      if (!node) {
        throw new Error(`Node not found: ${uuid}`);
      }
      node[property] = value;
      return success(serializeNode(node, false), `Node property updated: ${property}`);
    } catch (error) {
      return failure(error);
    }
  }),

  setNodeTransform: withReply(function setNodeTransform(uuid: string, position?: VecLike, rotation?: VecLike, scale?: VecLike) {
    try {
      const node = findNodeByUuid(uuid);
      if (!node) {
        throw new Error(`Node not found: ${uuid}`);
      }
      setPosition(node, position);
      setRotation(node, rotation);
      setScale(node, scale);
      return success(serializeNode(node, false), 'Node transform updated');
    } catch (error) {
      return failure(error);
    }
  }),

  addComponent: withReply(function addComponent(nodeUuid: string, componentType: string) {
    try {
      const node = findNodeByUuid(nodeUuid);
      if (!node) {
        throw new Error(`Node not found: ${nodeUuid}`);
      }
      const cls = getComponentClass(componentType);
      const component = node.getComponent(cls) || node.addComponent(cls);
      return success(serializeComponent(component), `Component added: ${componentType}`);
    } catch (error) {
      return failure(error);
    }
  }),

  removeComponent: withReply(function removeComponent(nodeUuid: string, componentType: string) {
    try {
      const node = findNodeByUuid(nodeUuid);
      if (!node) {
        throw new Error(`Node not found: ${nodeUuid}`);
      }
      const component = getComponentOnNode(node, componentType);
      if (!component) {
        throw new Error(`Component not found: ${componentType}`);
      }
      component.destroy();
      return success({ nodeUuid, componentType }, `Component removed: ${componentType}`);
    } catch (error) {
      return failure(error);
    }
  }),

  getComponents: withReply(function getComponents(nodeUuid: string) {
    try {
      const node = findNodeByUuid(nodeUuid);
      if (!node) {
        throw new Error(`Node not found: ${nodeUuid}`);
      }
      return success((node._components || []).map((component: any) => serializeComponent(component)));
    } catch (error) {
      return failure(error);
    }
  }),

  getComponentInfo: withReply(function getComponentInfo(nodeUuid: string, componentType: string) {
    try {
      const node = findNodeByUuid(nodeUuid);
      if (!node) {
        throw new Error(`Node not found: ${nodeUuid}`);
      }
      const component = getComponentOnNode(node, componentType);
      if (!component) {
        throw new Error(`Component not found: ${componentType}`);
      }
      return success(serializeComponent(component));
    } catch (error) {
      return failure(error);
    }
  }),

  setComponentProperty: withReply(async function setComponentProperty(args: any) {
    try {
      const node = findNodeByUuid(args.nodeUuid);
      if (!node) {
        throw new Error(`Node not found: ${args.nodeUuid}`);
      }
      const component = getComponentOnNode(node, args.componentType);
      if (!component) {
        throw new Error(`Component not found: ${args.componentType}`);
      }
      await setComponentPropertyValue(component, args.property, args.value);
      return success(serializeComponent(component), `Component property updated: ${args.property}`);
    } catch (error) {
      return failure(error);
    }
  }),

  setSpriteFrameByUuid: withReply(async function setSpriteFrameByUuid(nodeUuid: string, spriteFrameUuid: string, sizeMode?: string) {
    try {
      const result = await assignSpriteFrame(nodeUuid, spriteFrameUuid, sizeMode);
      return success(result, 'SpriteFrame assigned');
    } catch (error) {
      return failure(error);
    }
  }),

  bindComponentAsset: withReply(async function bindComponentAssetHandler(args: any) {
    try {
      const result = await bindComponentAsset(args);
      return success(result, `Component asset bound: ${args.property}`);
    } catch (error) {
      return failure(error);
    }
  }),

  applySceneResourceBindings: withReply(async function applySceneResourceBindingsHandler(bindings: any[], saveAfterApply = false) {
    try {
      const results = await applySceneResourceBindings(bindings || []);
      const summary = {
        total: results.length,
        successCount: results.filter((item) => item.success).length,
        failureCount: results.filter((item) => !item.success).length,
      };
      let saveResult: any = null;
      if (saveAfterApply) {
        const serialized = serializeCurrentSceneAsset();
        const assetdbResult = await createOrSaveAsset(serialized.sceneUrl, serialized.content);
        saveResult = {
          sceneUrl: serialized.sceneUrl,
          assetdbResult,
        };
      }
      return success({
        summary,
        results,
        saveResult,
      }, 'Scene resource bindings applied');
    } catch (error) {
      return failure(error);
    }
  }),

  attachScript: withReply(function attachScript(nodeUuid: string, scriptClassName: string) {
    try {
      const node = findNodeByUuid(nodeUuid);
      if (!node) {
        throw new Error(`Node not found: ${nodeUuid}`);
      }
      const component = node.getComponent(scriptClassName) || node.addComponent(scriptClassName);
      return success(serializeComponent(component), `Script attached: ${scriptClassName}`);
    } catch (error) {
      return failure(error);
    }
  }),

  getAvailableComponents: withReply(function getAvailableComponents() {
    try {
      const basic = [
        'cc.Sprite',
        'cc.Label',
        'cc.Button',
        'cc.RichText',
        'cc.Toggle',
        'cc.ScrollView',
        'cc.EditBox',
        'cc.Mask',
        'cc.Widget',
        'cc.Layout',
        'cc.Animation',
        'cc.AudioSource',
        'cc.Camera',
      ];
      return success(basic);
    } catch (error) {
      return failure(error);
    }
  }),

  executeDebugScript: withReply(async function executeDebugScript(script: string) {
    try {
      const result = await Promise.resolve(eval(script));
      return success(serializeValue(result), 'Script executed');
    } catch (error) {
      return failure(error);
    }
  }),

  createScene: withReply(function createScene(sceneName: string, savePath?: string) {
    try {
      const scene = createSceneAsset(sceneName);
      cc.director.runSceneImmediate(scene);
      return success({ name: sceneName, savePath: savePath || null }, 'Scene created in memory');
    } catch (error) {
      return failure(error);
    }
  }),

  saveScene: withReply(async function saveScene() {
    try {
      const serialized = serializeCurrentSceneAsset();
      const assetdbResult = await createOrSaveAsset(serialized.sceneUrl, serialized.content);
      return success({
        path: serialized.sceneUrl,
        assetdbResult,
        contentLength: serialized.content.length,
      }, 'Scene saved');
    } catch (error) {
      return failure(error);
    }
  }),

  reloadCurrentScene: withReply(async function reloadCurrentScene() {
    try {
      const sceneUrl = getCurrentSceneUrl();
      if (!sceneUrl) {
        throw new Error('Current scene URL is unavailable');
      }
      if (!Editor?.scene?.open) {
        throw new Error('Editor.scene.open is unavailable');
      }
      await new Promise<void>((resolve, reject) => {
        Editor.scene.open(sceneUrl, (err: Error | null) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
      return success({ path: sceneUrl }, 'Current scene reloaded');
    } catch (error) {
      return failure(error);
    }
  }),

  createPrefabFromNode: withReply(function createPrefabFromNode(nodeUuid: string, assetPath: string) {
    try {
      const node = findNodeByUuid(nodeUuid);
      if (!node) {
        throw new Error(`Node not found: ${nodeUuid}`);
      }
      const cloned = createNodeSnapshot(node);
      const serialized = Editor.serialize ? Editor.serialize(cloned) : JSON.stringify(serializeNode(cloned, true), null, 2);
      return success({
        assetPath,
        serialized,
        node: serializeNode(node, true),
      }, 'Prefab snapshot generated');
    } catch (error) {
      return failure(error);
    }
  }),

  instantiatePrefab: withReply(function instantiatePrefab(serializedOrAsset: any, parentUuid?: string, position?: VecLike) {
    try {
      let node: any = null;
      if (typeof serializedOrAsset === 'string') {
        try {
          const asset = cc.deserialize ? cc.deserialize(serializedOrAsset) : JSON.parse(serializedOrAsset);
          const source = asset && asset.data ? asset.data : asset;
          node = cc.instantiate(source);
        } catch (error) {
          throw new Error(`Failed to instantiate prefab payload: ${error}`);
        }
      } else if (serializedOrAsset && cc.instantiate) {
        const source = serializedOrAsset && serializedOrAsset.data ? serializedOrAsset.data : serializedOrAsset;
        node = cc.instantiate(source);
      }

      if (!node) {
        throw new Error('Unable to instantiate prefab');
      }

      resolveParent(parentUuid).addChild(node);
      setPosition(node, position);
      return success(serializeNode(node, true), 'Prefab instantiated');
    } catch (error) {
      return failure(error);
    }
  }),

  ping: withReply(function ping() {
    try {
      return success({
        sceneName: getSceneRoot().name,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return failure(error);
    }
  }),

  resolveAssetPath: withReply(function resolveAssetPath(relativePath: string) {
    try {
      const fullPath = path.join(Editor.Project.path, relativePath);
      return success({ relativePath, fullPath });
    } catch (error) {
      return failure(error);
    }
  }),
};

export = handlers;
