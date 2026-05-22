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

const ALL_STORES = "All";

class FileTreePage extends React.Component {
  constructor(props) {
    super(props);
    const routeStore = this.getRouteStore(props);
    this.requestId = 0;
    this.selectedStoreName = Setting.getStore();
    this.state = {
      classes: props,
      owner: routeStore.owner,
      storeName: routeStore.storeName,
      store: null,
    };
  }

  componentDidMount() {
    this.loadRouteStore();
    window.addEventListener("storeChanged", this.handleStoreChange);
  }

  componentDidUpdate(prevProps) {
    const routeStore = this.getRouteStore();
    if (this.getStoreOwner(prevProps) !== routeStore.owner || this.getRouteStoreName(prevProps) !== routeStore.storeName) {
      this.loadRouteStore(routeStore);
    }
  }

  componentWillUnmount() {
    this.invalidateRequests();
    window.removeEventListener("storeChanged", this.handleStoreChange);
  }

  getStoreOwner(props = this.props) {
    return props.match?.params?.owner || props.owner || props.account?.owner || StoreBackend.DEFAULT_STORE_OWNER;
  }

  getRouteStoreName(props = this.props) {
    return props.match?.params?.storeName || props.storeName || "";
  }

  getRouteStore(props = this.props) {
    return {
      owner: this.getStoreOwner(props),
      storeName: this.getRouteStoreName(props),
    };
  }

  getStore() {
    this.loadRouteStore();
  }

  loadRouteStore(routeStore = this.getRouteStore()) {
    if (routeStore.storeName) {
      this.loadStore(routeStore.owner, routeStore.storeName);
      return;
    }
    this.loadDefaultStore();
  }

  invalidateRequests() {
    this.requestId += 1;
    return this.requestId;
  }

  loadStore(owner, storeName) {
    const requestId = this.invalidateRequests();
    this.setState({
      owner: owner,
      storeName: storeName,
    });

    StoreBackend.getStore(owner, storeName)
      .then((res) => {
        if (requestId !== this.requestId) {
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

  loadDefaultStore() {
    const requestId = this.invalidateRequests();

    StoreBackend.getDefaultStore()
      .then((res) => {
        if (requestId !== this.requestId) {
          return;
        }

        if (res.status === "ok" && res.data) {
          this.navigateToStore(res.data.owner || this.getStoreOwner(), res.data.name);
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

    if (storeName !== ALL_STORES) {
      this.invalidateRequests();
      this.navigateToStore(this.getStoreOwner(), storeName);
      return;
    }

    this.loadDefaultStore();
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
