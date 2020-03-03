// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Common from '../common/common.js';
import * as SDK from '../sdk/sdk.js';
import * as UI from '../ui/ui.js';

import {MaxDeviceSize, MinDeviceSize} from './DeviceModeModel.js';

/**
 * @unrestricted
 */
export class EmulatedDevice {
  constructor() {
    /** @type {string} */
    this.title = '';
    /** @type {string} */
    this.type = Type.Unknown;
    /** @type {!Emulation.EmulatedDevice.Orientation} */
    this.vertical = {width: 0, height: 0, outlineInsets: null, outlineImage: null};
    /** @type {!Emulation.EmulatedDevice.Orientation} */
    this.horizontal = {width: 0, height: 0, outlineInsets: null, outlineImage: null};
    /** @type {number} */
    this.deviceScaleFactor = 1;
    /** @type {!Array.<string>} */
    this.capabilities = [Capability.Touch, Capability.Mobile];
    /** @type {string} */
    this.userAgent = '';
    /** @type {!Array.<!Emulation.EmulatedDevice.Mode>} */
    this.modes = [];

    /** @type {string} */
    this._show = _Show.Default;
    /** @type {boolean} */
    this._showByDefault = true;

    /** @type {?Root.Runtime.Extension} */
    this._extension = null;
  }

  /**
   * @param {*} json
   * @return {?EmulatedDevice}
   */
  static fromJSONV1(json) {
    try {
      /**
       * @param {*} object
       * @param {string} key
       * @param {string} type
       * @param {*=} defaultValue
       * @return {*}
       */
      function parseValue(object, key, type, defaultValue) {
        if (typeof object !== 'object' || object === null || !object.hasOwnProperty(key)) {
          if (typeof defaultValue !== 'undefined') {
            return defaultValue;
          }
          throw new Error('Emulated device is missing required property \'' + key + '\'');
        }
        const value = object[key];
        if (typeof value !== type || value === null) {
          throw new Error('Emulated device property \'' + key + '\' has wrong type \'' + typeof value + '\'');
        }
        return value;
      }

      /**
       * @param {*} object
       * @param {string} key
       * @return {number}
       */
      function parseIntValue(object, key) {
        const value = /** @type {number} */ (parseValue(object, key, 'number'));
        if (value !== Math.abs(value)) {
          throw new Error('Emulated device value \'' + key + '\' must be integer');
        }
        return value;
      }

      /**
       * @param {*} json
       * @return {!UI.Geometry.Insets}
       */
      function parseInsets(json) {
        return new UI.Geometry.Insets(
            parseIntValue(json, 'left'), parseIntValue(json, 'top'), parseIntValue(json, 'right'),
            parseIntValue(json, 'bottom'));
      }

      /**
       * @param {*} json
       * @return {!EmulatedDevice.Orientation}
       */
      function parseOrientation(json) {
        const result = {};

        result.width = parseIntValue(json, 'width');
        if (result.width < 0 || result.width > MaxDeviceSize || result.width < MinDeviceSize) {
          throw new Error('Emulated device has wrong width: ' + result.width);
        }

        result.height = parseIntValue(json, 'height');
        if (result.height < 0 || result.height > MaxDeviceSize || result.height < MinDeviceSize) {
          throw new Error('Emulated device has wrong height: ' + result.height);
        }

        const outlineInsets = parseValue(json['outline'], 'insets', 'object', null);
        if (outlineInsets) {
          result.outlineInsets = parseInsets(outlineInsets);
          if (result.outlineInsets.left < 0 || result.outlineInsets.top < 0) {
            throw new Error('Emulated device has wrong outline insets');
          }
          result.outlineImage = /** @type {string} */ (parseValue(json['outline'], 'image', 'string'));
        }
        return /** @type {!EmulatedDevice.Orientation} */ (result);
      }

      const result = new EmulatedDevice();
      result.title = /** @type {string} */ (parseValue(json, 'title', 'string'));
      result.type = /** @type {string} */ (parseValue(json, 'type', 'string'));
      const rawUserAgent = /** @type {string} */ (parseValue(json, 'user-agent', 'string'));
      result.userAgent = SDK.NetworkManager.MultitargetNetworkManager.patchUserAgentWithChromeVersion(rawUserAgent);

      const capabilities = parseValue(json, 'capabilities', 'object', []);
      if (!Array.isArray(capabilities)) {
        throw new Error('Emulated device capabilities must be an array');
      }
      result.capabilities = [];
      for (let i = 0; i < capabilities.length; ++i) {
        if (typeof capabilities[i] !== 'string') {
          throw new Error('Emulated device capability must be a string');
        }
        result.capabilities.push(capabilities[i]);
      }

      result.deviceScaleFactor = /** @type {number} */ (parseValue(json['screen'], 'device-pixel-ratio', 'number'));
      if (result.deviceScaleFactor < 0 || result.deviceScaleFactor > 100) {
        throw new Error('Emulated device has wrong deviceScaleFactor: ' + result.deviceScaleFactor);
      }

      result.vertical = parseOrientation(parseValue(json['screen'], 'vertical', 'object'));
      result.horizontal = parseOrientation(parseValue(json['screen'], 'horizontal', 'object'));

      const modes = parseValue(json, 'modes', 'object', []);
      if (!Array.isArray(modes)) {
        throw new Error('Emulated device modes must be an array');
      }
      result.modes = [];
      for (let i = 0; i < modes.length; ++i) {
        const mode = {};
        mode.title = /** @type {string} */ (parseValue(modes[i], 'title', 'string'));
        mode.orientation = /** @type {string} */ (parseValue(modes[i], 'orientation', 'string'));
        if (mode.orientation !== Vertical && mode.orientation !== Horizontal) {
          throw new Error('Emulated device mode has wrong orientation \'' + mode.orientation + '\'');
        }
        const orientation = result.orientationByName(mode.orientation);
        mode.insets = parseInsets(parseValue(modes[i], 'insets', 'object'));
        if (mode.insets.top < 0 || mode.insets.left < 0 || mode.insets.right < 0 || mode.insets.bottom < 0 ||
            mode.insets.top + mode.insets.bottom > orientation.height ||
            mode.insets.left + mode.insets.right > orientation.width) {
          throw new Error('Emulated device mode \'' + mode.title + '\'has wrong mode insets');
        }

        mode.image = /** @type {string} */ (parseValue(modes[i], 'image', 'string', null));
        result.modes.push(mode);
      }

      result._showByDefault = /** @type {boolean} */ (parseValue(json, 'show-by-default', 'boolean', undefined));
      result._show =
          /** @type {string} */ (parseValue(json, 'show', 'string', _Show.Default));

      return result;
    } catch (e) {
      return null;
    }
  }

  /**
   * @param {!EmulatedDevice} device1
   * @param {!EmulatedDevice} device2
   * @return {number}
   */
  static deviceComparator(device1, device2) {
    const order1 = (device1._extension && device1._extension.descriptor()['order']) || -1;
    const order2 = (device2._extension && device2._extension.descriptor()['order']) || -1;
    if (order1 > order2) {
      return 1;
    }
    if (order2 > order1) {
      return -1;
    }
    return device1.title < device2.title ? -1 : (device1.title > device2.title ? 1 : 0);
  }

  /**
   * @return {?Root.Runtime.Extension}
   */
  extension() {
    return this._extension;
  }

  /**
   * @param {?Root.Runtime.Extension} extension
   */
  setExtension(extension) {
    this._extension = extension;
  }

  /**
   * @param {string} orientation
   * @return {!Array.<!EmulatedDevice.Mode>}
   */
  modesForOrientation(orientation) {
    const result = [];
    for (let index = 0; index < this.modes.length; index++) {
      if (this.modes[index].orientation === orientation) {
        result.push(this.modes[index]);
      }
    }
    return result;
  }

  /**
   * @return {*}
   */
  _toJSON() {
    const json = {};
    json['title'] = this.title;
    json['type'] = this.type;
    json['user-agent'] = this.userAgent;
    json['capabilities'] = this.capabilities;

    json['screen'] = {};
    json['screen']['device-pixel-ratio'] = this.deviceScaleFactor;
    json['screen']['vertical'] = this._orientationToJSON(this.vertical);
    json['screen']['horizontal'] = this._orientationToJSON(this.horizontal);

    json['modes'] = [];
    for (let i = 0; i < this.modes.length; ++i) {
      const mode = {};
      mode['title'] = this.modes[i].title;
      mode['orientation'] = this.modes[i].orientation;
      mode['insets'] = {};
      mode['insets']['left'] = this.modes[i].insets.left;
      mode['insets']['top'] = this.modes[i].insets.top;
      mode['insets']['right'] = this.modes[i].insets.right;
      mode['insets']['bottom'] = this.modes[i].insets.bottom;
      if (this.modes[i].image) {
        mode['image'] = this.modes[i].image;
      }
      json['modes'].push(mode);
    }

    json['show-by-default'] = this._showByDefault;
    json['show'] = this._show;

    return json;
  }

  /**
   * @param {!EmulatedDevice.Orientation} orientation
   * @return {*}
   */
  _orientationToJSON(orientation) {
    const json = {};
    json['width'] = orientation.width;
    json['height'] = orientation.height;
    if (orientation.outlineInsets) {
      json['outline'] = {};
      json['outline']['insets'] = {};
      json['outline']['insets']['left'] = orientation.outlineInsets.left;
      json['outline']['insets']['top'] = orientation.outlineInsets.top;
      json['outline']['insets']['right'] = orientation.outlineInsets.right;
      json['outline']['insets']['bottom'] = orientation.outlineInsets.bottom;
      json['outline']['image'] = orientation.outlineImage;
    }
    return json;
  }

  /**
   * @param {!EmulatedDevice.Mode} mode
   * @return {string}
   */
  modeImage(mode) {
    if (!mode.image) {
      return '';
    }
    if (!this._extension) {
      return mode.image;
    }
    return this._extension.module().substituteURL(mode.image);
  }

  /**
   * @param {!EmulatedDevice.Mode} mode
   * @return {string}
   */
  outlineImage(mode) {
    const orientation = this.orientationByName(mode.orientation);
    if (!orientation.outlineImage) {
      return '';
    }
    if (!this._extension) {
      return orientation.outlineImage;
    }
    return this._extension.module().substituteURL(orientation.outlineImage);
  }

  /**
   * @param {string} name
   * @return {!EmulatedDevice.Orientation}
   */
  orientationByName(name) {
    return name === Vertical ? this.vertical : this.horizontal;
  }

  /**
   * @return {boolean}
   */
  show() {
    if (this._show === _Show.Default) {
      return this._showByDefault;
    }
    return this._show === _Show.Always;
  }

  /**
   * @param {boolean} show
   */
  setShow(show) {
    this._show = show ? _Show.Always : _Show.Never;
  }

  /**
   * @param {!EmulatedDevice} other
   */
  copyShowFrom(other) {
    this._show = other._show;
  }

  /**
   * @return {boolean}
   */
  touch() {
    return this.capabilities.indexOf(Capability.Touch) !== -1;
  }

  /**
   * @return {boolean}
   */
  mobile() {
    return this.capabilities.indexOf(Capability.Mobile) !== -1;
  }
}

export const Horizontal = 'horizontal';
export const Vertical = 'vertical';

export const Type = {
  Phone: 'phone',
  Tablet: 'tablet',
  Notebook: 'notebook',
  Desktop: 'desktop',
  Unknown: 'unknown'
};

export const Capability = {
  Touch: 'touch',
  Mobile: 'mobile'
};

export const _Show = {
  Always: 'Always',
  Default: 'Default',
  Never: 'Never'
};

/** @type {!EmulatedDevicesList} */
let _instance;

/**
 * @unrestricted
 */
export class EmulatedDevicesList extends Common.ObjectWrapper.ObjectWrapper {
  constructor() {
    super();

    /** @type {!Common.Settings.Setting} */
    this._standardSetting = self.Common.settings.createSetting('standardEmulatedDeviceList', []);
    /** @type {!Set.<!EmulatedDevice>} */
    this._standard = new Set();
    this._listFromJSONV1(this._standardSetting.get(), this._standard);
    this._updateStandardDevices();

    /** @type {!Common.Settings.Setting} */
    this._customSetting = self.Common.settings.createSetting('customEmulatedDeviceList', []);
    /** @type {!Set.<!EmulatedDevice>} */
    this._custom = new Set();
    if (!this._listFromJSONV1(this._customSetting.get(), this._custom)) {
      this.saveCustomDevices();
    }
  }

  /**
   * @return {!EmulatedDevicesList}
   */
  static instance() {
    if (!_instance) {
      _instance = new EmulatedDevicesList();
    }
    return _instance;
  }

  _updateStandardDevices() {
    const devices = new Set();
    const extensions = self.runtime.extensions('emulated-device');
    for (const extension of extensions) {
      const device = EmulatedDevice.fromJSONV1(extension.descriptor()['device']);
      device.setExtension(extension);
      devices.add(device);
    }
    this._copyShowValues(this._standard, devices);
    this._standard = devices;
    this.saveStandardDevices();
  }

  /**
   * @param {!Array.<*>} jsonArray
   * @param {!Set.<!EmulatedDevice>} result
   * @return {boolean}
   */
  _listFromJSONV1(jsonArray, result) {
    if (!Array.isArray(jsonArray)) {
      return false;
    }
    let success = true;
    for (let i = 0; i < jsonArray.length; ++i) {
      const device = EmulatedDevice.fromJSONV1(jsonArray[i]);
      if (device) {
        result.add(device);
        if (!device.modes.length) {
          device.modes.push(
              {title: '', orientation: Horizontal, insets: new UI.Geometry.Insets(0, 0, 0, 0), image: null});
          device.modes.push(
              {title: '', orientation: Vertical, insets: new UI.Geometry.Insets(0, 0, 0, 0), image: null});
        }
      } else {
        success = false;
      }
    }
    return success;
  }

  /**
   * @return {!Array.<!EmulatedDevice>}
   */
  standard() {
    return [...this._standard];
  }

  /**
   * @return {!Array.<!EmulatedDevice>}
   */
  custom() {
    return [...this._custom];
  }

  revealCustomSetting() {
    Common.Revealer.reveal(this._customSetting);
  }

  /**
   * @param {!EmulatedDevice} device
   */
  addCustomDevice(device) {
    this._custom.add(device);
    this.saveCustomDevices();
  }

  /**
   * @param {!EmulatedDevice} device
   */
  removeCustomDevice(device) {
    this._custom.delete(device);
    this.saveCustomDevices();
  }

  saveCustomDevices() {
    const json = [];
    this._custom.forEach(device => json.push(device._toJSON()));

    this._customSetting.set(json);
    this.dispatchEventToListeners(Events.CustomDevicesUpdated);
  }

  saveStandardDevices() {
    const json = [];
    this._standard.forEach(device => json.push(device._toJSON()));

    this._standardSetting.set(json);
    this.dispatchEventToListeners(Events.StandardDevicesUpdated);
  }

  /**
   * @param {!Set.<!EmulatedDevice>} from
   * @param {!Set.<!EmulatedDevice>} to
   */
  _copyShowValues(from, to) {
    const fromDeviceById = new Map();
    for (const device of from) {
      fromDeviceById.set(device.title, device);
    }

    for (const toDevice of to) {
      const fromDevice = fromDeviceById.get(toDevice.title);
      if (fromDevice) {
        toDevice.copyShowFrom(fromDevice);
      }
    }
  }
}

/** @enum {symbol} */
export const Events = {
  CustomDevicesUpdated: Symbol('CustomDevicesUpdated'),
  StandardDevicesUpdated: Symbol('StandardDevicesUpdated')
};
