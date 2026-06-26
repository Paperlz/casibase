// Copyright 2026 The OpenAgent Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React from "react";
import {Button} from "antd";
import {CheckOutlined, CloseOutlined, ColumnWidthOutlined, EyeInvisibleOutlined, SettingOutlined} from "@ant-design/icons";
import i18next from "i18next";
import * as StoreBackend from "../backend/StoreBackend";
import * as Setting from "../Setting";
import "./VirtualFigure.css";

const storagePrefix = "openagent_virtual_figure";

function getStoreStorageId(store) {
  if (!store) {
    return "default";
  }
  return `${store.owner || "default"}/${store.name || "default"}`;
}

function getStorageKey(store, suffix) {
  return `${storagePrefix}:${getStoreStorageId(store)}:${suffix}`;
}

function loadJson(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (_) {
    return defaultValue;
  }
}

const getDefaultCollapsed = mode => mode === "collapsed";

const statusLabelMap = {
  idle: {key: "chat:Figure idle", label: "Idle"},
  typing: {key: "chat:Figure typing", label: "Typing"},
  thinking: {key: "chat:Figure thinking", label: "Thinking"},
  replying: {key: "chat:Figure replying", label: "Replying"},
  error: {key: "chat:Figure error", label: "Error"},
  done: {key: "chat:Figure done", label: "Done"},
};

class VirtualFigure extends React.Component {
  constructor(props) {
    super(props);
    const mode = props.store?.figureMode || "expanded";
    this.state = {
      collapsed: loadJson(getStorageKey(props.store, "collapsed"), getDefaultCollapsed(mode)),
      position: loadJson(getStorageKey(props.store, "position"), null),
      size: localStorage.getItem(getStorageKey(props.store, "size")) || "medium",
      disabled: false,
      dragging: false,
      menuOpen: false,
    };
    this.dragState = null;
    this.suppressNextClick = false;
    this.figureRef = React.createRef();
  }

  componentDidUpdate(prevProps) {
    if (getStoreStorageId(prevProps.store) !== getStoreStorageId(this.props.store)) {
      const mode = this.props.store?.figureMode || "expanded";
      this.setState({
        collapsed: loadJson(getStorageKey(this.props.store, "collapsed"), getDefaultCollapsed(mode)),
        position: loadJson(getStorageKey(this.props.store, "position"), null),
        size: localStorage.getItem(getStorageKey(this.props.store, "size")) || "medium",
        disabled: false,
        dragging: false,
        menuOpen: false,
      }, this.scheduleClampPosition);
    }
  }

  componentDidMount() {
    document.addEventListener("pointerdown", this.handleDocumentPointerDown);
    window.addEventListener("resize", this.scheduleClampPosition);
    this.scheduleClampPosition();
  }

  componentWillUnmount() {
    this.removeDragListeners();
    document.removeEventListener("pointerdown", this.handleDocumentPointerDown);
    window.removeEventListener("resize", this.scheduleClampPosition);
  }

  getStatusText() {
    const item = statusLabelMap[this.props.status] || statusLabelMap.idle;
    return i18next.t(item.key, {defaultValue: item.label});
  }

  handleMenuAction = (key) => {
    if (key === "focus") {
      this.props.onFocusInput?.();
    } else if (key === "reset") {
      this.resetPosition();
    } else if (key === "sizeSmall") {
      this.setSize("small");
    } else if (key === "sizeMedium") {
      this.setSize("medium");
    } else if (key === "sizeLarge") {
      this.setSize("large");
    } else if (key === "resetSize") {
      this.setSize("medium");
    } else if (key === "settings") {
      this.openFigureSettings();
    } else if (key === "disable") {
      this.disableFigure();
    }
    this.setState({menuOpen: false});
  };

  handleDocumentPointerDown = (event) => {
    if (!this.state.menuOpen) {
      return;
    }
    if (this.figureRef.current?.contains(event.target)) {
      return;
    }
    this.setState({menuOpen: false});
  };

  disableFigure = () => {
    const store = this.props.store;
    if (!store?.owner || !store?.name) {
      this.setState({disabled: true});
      return;
    }

    const nextStore = Setting.deepCopy(store);
    nextStore.figureEnabled = false;
    // Avoid sending the heavy file tree when only updating figure settings.
    nextStore.fileTree = undefined;

    StoreBackend.updateStore(store.owner, store.name, nextStore)
      .then((res) => {
        if (res.status === "ok") {
          this.props.onStoreUpdate?.(nextStore);
          this.setState({disabled: true});
        } else {
          Setting.showMessage("error", `${i18next.t("general:Failed to save")}: ${res.msg}`);
        }
      })
      .catch(error => {
        Setting.showMessage("error", `${i18next.t("general:Failed to save")}: ${error}`);
      });
  };

  toggleCollapsed = () => {
    const collapsed = !this.state.collapsed;
    localStorage.setItem(getStorageKey(this.props.store, "collapsed"), JSON.stringify(collapsed));
    this.setState({collapsed}, this.scheduleClampPosition);
  };

  resetPosition = () => {
    localStorage.removeItem(getStorageKey(this.props.store, "position"));
    this.setState({position: null});
  };

  setSize = (size) => {
    localStorage.setItem(getStorageKey(this.props.store, "size"), size);
    this.setState({size}, this.scheduleClampPosition);
  };

  openFigureSettings = () => {
    const store = this.props.store;
    if (store?.owner && store?.name) {
      window.location.assign(`/stores/${encodeURIComponent(store.owner)}/${encodeURIComponent(store.name)}`);
    }
  };

  startDrag = (event) => {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    const clientX = event.clientX ?? event.touches?.[0]?.clientX;
    const clientY = event.clientY ?? event.touches?.[0]?.clientY;
    if (clientX === undefined || clientY === undefined) {
      return;
    }

    const figureEl = this.figureRef.current;
    if (!figureEl) {
      return;
    }
    const rect = figureEl.getBoundingClientRect();
    this.dragState = {
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
      startX: clientX,
      startY: clientY,
      moved: false,
    };
    this.setState({dragging: true});
    window.addEventListener("pointermove", this.handleDrag);
    window.addEventListener("pointerup", this.stopDrag);
  };

  handleDrag = (event) => {
    if (!this.dragState) {
      return;
    }
    event.preventDefault();
    const figureEl = this.figureRef.current;
    const parentRect = figureEl?.offsetParent?.getBoundingClientRect() || {left: 0, top: 0, width: window.innerWidth, height: window.innerHeight};
    const rect = figureEl?.getBoundingClientRect() || {width: 76, height: 76};
    const maxLeft = Math.max(8, parentRect.width - rect.width - 8);
    const maxTop = Math.max(8, parentRect.height - rect.height - 8);
    const left = Math.min(Math.max(8, event.clientX - parentRect.left - this.dragState.offsetX), maxLeft);
    const top = Math.min(Math.max(8, event.clientY - parentRect.top - this.dragState.offsetY), maxTop);
    this.dragState.moved = Math.abs(event.clientX - this.dragState.startX) > 2 || Math.abs(event.clientY - this.dragState.startY) > 2;
    this.setState({position: {left, top}});
  };

  stopDrag = () => {
    const moved = this.dragState?.moved;
    if (this.dragState?.moved && this.state.position) {
      localStorage.setItem(getStorageKey(this.props.store, "position"), JSON.stringify(this.state.position));
    }
    this.dragState = null;
    this.suppressNextClick = moved;
    this.setState({dragging: false});
    this.removeDragListeners();
  };

  removeDragListeners() {
    window.removeEventListener("pointermove", this.handleDrag);
    window.removeEventListener("pointerup", this.stopDrag);
  }

  scheduleClampPosition = () => {
    requestAnimationFrame(() => {
      this.clampPosition();
    });
  };

  clampPosition() {
    if (!this.state.position || !this.figureRef.current) {
      return;
    }
    const figureEl = this.figureRef.current;
    const parentRect = figureEl.offsetParent?.getBoundingClientRect();
    const rect = figureEl.getBoundingClientRect();
    if (!parentRect || rect.width === 0 || rect.height === 0) {
      return;
    }
    const maxLeft = Math.max(8, parentRect.width - rect.width - 8);
    const maxTop = Math.max(8, parentRect.height - rect.height - 8);
    const nextPosition = {
      left: Math.min(Math.max(8, this.state.position.left), maxLeft),
      top: Math.min(Math.max(8, this.state.position.top), maxTop),
    };
    if (nextPosition.left !== this.state.position.left || nextPosition.top !== this.state.position.top) {
      localStorage.setItem(getStorageKey(this.props.store, "position"), JSON.stringify(nextPosition));
      this.setState({position: nextPosition});
    }
  }

  handleBodyClick = (event) => {
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }
    event.preventDefault();
    this.setState(prevState => ({menuOpen: !prevState.menuOpen}));
  };

  renderMenuItem(key, label, icon = null, active = false) {
    return (
      <button type="button" className={`chat-virtual-figure__menu-item${active ? " chat-virtual-figure__menu-item--active" : ""}`} onClick={() => this.handleMenuAction(key)}>
        {icon ? <span className="chat-virtual-figure__menu-icon">{icon}</span> : null}
        <span>{label}</span>
      </button>
    );
  }

  renderMenu() {
    if (!this.state.menuOpen) {
      return null;
    }

    return (
      <div className="chat-virtual-figure__menu" onPointerDown={(event) => event.stopPropagation()}>
        <div className="chat-virtual-figure__menu-status">{this.getStatusText()}</div>
        {this.renderMenuItem("sizeSmall", i18next.t("chat:Figure size small", {defaultValue: "Small"}), this.state.size === "small" ? <CheckOutlined /> : null, this.state.size === "small")}
        {this.renderMenuItem("sizeMedium", i18next.t("chat:Figure size medium", {defaultValue: "Medium"}), this.state.size === "medium" ? <CheckOutlined /> : null, this.state.size === "medium")}
        {this.renderMenuItem("sizeLarge", i18next.t("chat:Figure size large", {defaultValue: "Large"}), this.state.size === "large" ? <CheckOutlined /> : null, this.state.size === "large")}
        {this.renderMenuItem("settings", i18next.t("chat:Figure settings", {defaultValue: "Figure settings"}), <SettingOutlined />)}
        {this.renderMenuItem("disable", i18next.t("chat:Disable figure", {defaultValue: "Disable figure"}), <EyeInvisibleOutlined />)}
      </div>
    );
  }

  render() {
    if (!this.props.visible || this.state.disabled) {
      return null;
    }

    const {status, imageUrl} = this.props;
    const className = [
      "chat-virtual-figure",
      `chat-virtual-figure--${status || "idle"}`,
      `chat-virtual-figure--size-${this.state.size}`,
      this.state.collapsed ? "chat-virtual-figure--collapsed" : "",
      this.state.dragging ? "chat-virtual-figure--dragging" : "",
    ].filter(Boolean).join(" ");
    const style = this.state.position ? {left: this.state.position.left, top: this.state.position.top, right: "auto", bottom: "auto"} : undefined;

    return (
      <div ref={this.figureRef} className={className} style={style}>
        {this.renderMenu()}
        <div className="chat-virtual-figure__controls">
          <Button
            type="text"
            size="small"
            aria-label={i18next.t("chat:Reset figure position", {defaultValue: "Reset figure position"})}
            className="chat-virtual-figure__control-button"
            icon={<ColumnWidthOutlined />}
            onClick={this.resetPosition}
          />
          <Button
            type="text"
            size="small"
            aria-label={i18next.t("chat:Disable figure", {defaultValue: "Disable figure"})}
            className="chat-virtual-figure__control-button"
            icon={<CloseOutlined />}
            onClick={this.disableFigure}
          />
        </div>
        <div
          className="chat-virtual-figure__body"
          onPointerDown={this.startDrag}
          onClick={this.handleBodyClick}
          onDoubleClick={this.toggleCollapsed}
          role="button"
          tabIndex={0}
          aria-label={this.getStatusText()}
        >
          <div className="chat-virtual-figure__halo" />
          <img className="chat-virtual-figure__image" src={imageUrl} alt={i18next.t("chat:AI virtual figure", {defaultValue: "AI virtual figure"})} draggable={false} />
          <div className="chat-virtual-figure__screen">
            {status === "thinking" ? <span className="chat-virtual-figure__dots"><i /><i /><i /></span> : null}
            {status === "replying" ? <span className="chat-virtual-figure__wave"><i /><i /><i /></span> : null}
            {status === "error" ? <span className="chat-virtual-figure__mark">?</span> : null}
            {status === "done" ? <span className="chat-virtual-figure__mark"><CheckOutlined /></span> : null}
          </div>
          <div className="chat-virtual-figure__bubble">
            <span>{this.getStatusText()}</span>
          </div>
          <div className="chat-virtual-figure__chat-icon"><span>...</span></div>
        </div>
      </div>
    );
  }
}

export default VirtualFigure;
