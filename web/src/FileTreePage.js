// Copyright 2023 The OpenAgent Authors. All Rights Reserved.
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
import {Col, Row, Spin} from "antd";
import * as StoreBackend from "./backend/StoreBackend";
import FileTree from "./FileTree";
import i18next from "i18next";
import * as Setting from "./Setting";

class FileTreePage extends React.Component {
  constructor(props) {
    super(props);
    const routeStore = this.getRouteStore(props);
    this.storeRequestId = 0;
    this.storeChangeRequestId = 0;
    this.selectedStoreName = Setting.getStore();
    this.state = {
      classes: props,
      owner: routeStore.owner,
      storeName: routeStore.storeName,
      store: null,
    };
  }

  componentDidMount() {
    this.getStore();
    window.addEventListener("storeChanged", this.handleStoreChange);
  }

  componentDidUpdate(prevProps) {
    const prevRouteStore = this.getRouteStore(prevProps);
    const routeStore = this.getRouteStore();
    if (prevRouteStore.owner !== routeStore.owner || prevRouteStore.storeName !== routeStore.storeName) {
      this.loadStore(routeStore.owner, routeStore.storeName);
    }
  }

  componentWillUnmount() {
    this.storeRequestId += 1;
    this.storeChangeRequestId += 1;
    window.removeEventListener("storeChanged", this.handleStoreChange);
  }

  getRouteStore(props = this.props) {
    return {
      owner: props.match?.params?.owner || "admin",
      storeName: props.match?.params?.storeName || props.storeName || "_default_store_",
    };
  }

  getStore() {
    const {owner, storeName} = this.getRouteStore();
    this.loadStore(owner, storeName);
  }

  loadStore(owner, storeName) {
    const requestId = ++this.storeRequestId;
    this.setState({
      owner: owner,
      storeName: storeName,
      store: null,
    });

    StoreBackend.getStore(owner, storeName)
      .then((res) => {
        if (requestId !== this.storeRequestId) {
          return;
        }

        if (res.status === "ok") {
          if (res.data && typeof res.data2 === "string" && res.data2 !== "") {
            res.data.error = res.data2;
          }

          const store = res.data;
          this.setState({
            store: store,
            ...(store ? {owner: store.owner, storeName: store.name} : {}),
          });
        } else {
          Setting.showMessage("error", `${i18next.t("general:Failed to get")}: ${res.msg}`);
        }
      });
  }

  handleStoreChange = () => {
    const storeName = Setting.getStore();
    if (storeName === this.selectedStoreName) {
      return;
    }

    this.selectedStoreName = storeName;
    const requestId = ++this.storeChangeRequestId;

    if (storeName !== "All") {
      this.navigateToStore("admin", storeName);
      return;
    }

    StoreBackend.getStore("admin", "_default_store_")
      .then((res) => {
        if (requestId !== this.storeChangeRequestId) {
          return;
        }

        if (res.status === "ok" && res.data) {
          this.navigateToStore(res.data.owner || "admin", res.data.name);
        } else {
          Setting.showMessage("error", `${i18next.t("general:Failed to get")}: ${res.msg}`);
        }
      });
  };

  navigateToStore(owner, storeName) {
    if (!storeName) {
      return;
    }

    const pathname = `/stores/${owner}/${encodeURIComponent(storeName)}/view`;
    if (this.props.location?.pathname === pathname) {
      this.loadStore(owner, storeName);
    } else {
      this.props.history.push(pathname);
    }
  }

  render() {
    if (this.state.store === null) {
      return (
        <div style={{display: "flex", justifyContent: "center", alignItems: "center", height: "calc(100vh - 120px)"}}>
          <Spin size="large" tip={i18next.t("general:Loading...")} />
        </div>
      );
    }

    const searchParams = new URLSearchParams(this.props.location?.search || "");
    const rawFileKey = searchParams.get("fileKey");
    const initialFileKey = rawFileKey ? decodeURIComponent(rawFileKey) : null;

    return (
      <div>
        <Row>
          <Col span={24}>
            <FileTree account={this.props.account} store={this.state.store} initialFileKey={initialFileKey} onUpdateStore={(store) => {
              this.setState({
                store: store,
              });
              Setting.submitStoreEdit(store);
            }} onRefresh={() => this.getStore()} />
          </Col>
          {/* <Col span={10}>*/}
          {/*  <ChatPage account={this.props.account} />*/}
          {/* </Col>*/}
        </Row>
      </div>
    );
  }
}

export default FileTreePage;
