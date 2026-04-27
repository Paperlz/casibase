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
import {Button, Col, Input, Row} from "antd";
import * as Setting from "../Setting";
import i18next from "i18next";
import * as ProviderBackend from "../backend/ProviderBackend";

class TestWeChatIlinkWidget extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      sessionKey: "",
      testLoading: false,
      replyLoading: false,
      latestMessage: null,
      replyText: "",
      statusText: "",
    };
    this.waitTimer = null;
    this.unmounted = false;
  }

  componentWillUnmount() {
    this.unmounted = true;
    this.clearWaitTimer();
    if (this.state.sessionKey !== "") {
      ProviderBackend.stopWeChatIlinkTest(this.getProviderId(), this.state.sessionKey).catch(() => {});
    }
  }

  getProviderId() {
    const {provider} = this.props;
    return `${provider.owner}/${provider.name}`;
  }

  clearWaitTimer() {
    if (this.waitTimer !== null) {
      clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
  }

  startTest() {
    const id = this.getProviderId();
    this.clearWaitTimer();
    this.setState({
      testLoading: true,
      latestMessage: null,
      replyText: "",
      statusText: i18next.t("provider:Starting WeChat test"),
    });

    ProviderBackend.startWeChatIlinkTest(id)
      .then((res) => {
        if (this.unmounted) {
          return;
        }
        if (res.status === "ok") {
          this.setState({
            sessionKey: res.data.sessionKey,
            testLoading: false,
            statusText: i18next.t("provider:Waiting for WeChat message"),
          }, () => this.waitTestMessage());
        } else {
          this.setState({testLoading: false, statusText: ""});
          Setting.showMessage("error", `${i18next.t("general:Failed to save")}: ${res.msg}`);
        }
      })
      .catch((error) => {
        if (this.unmounted) {
          return;
        }
        this.setState({testLoading: false, statusText: ""});
        Setting.showMessage("error", `${i18next.t("general:Failed to connect to server")}: ${error}`);
      });
  }

  waitTestMessage() {
    const sessionKey = this.state.sessionKey;
    if (sessionKey === "") {
      return;
    }

    ProviderBackend.waitWeChatIlinkTest(this.getProviderId(), sessionKey)
      .then((res) => {
        if (this.unmounted || this.state.sessionKey !== sessionKey) {
          return;
        }
        if (res.status === "ok") {
          if (res.data.hasMessage) {
            this.setState({
              latestMessage: res.data,
              statusText: i18next.t("provider:WeChat message received"),
            });
          } else {
            this.setState({statusText: i18next.t("provider:Waiting for WeChat message")});
          }
          this.waitTimer = setTimeout(() => {
            this.waitTimer = null;
            this.waitTestMessage();
          }, 1000);
        } else {
          this.stopLocalTestState();
          Setting.showMessage("error", `${i18next.t("general:Failed to save")}: ${res.msg}`);
        }
      })
      .catch((error) => {
        if (this.unmounted) {
          return;
        }
        this.stopLocalTestState();
        Setting.showMessage("error", `${i18next.t("general:Failed to connect to server")}: ${error}`);
      });
  }

  stopLocalTestState() {
    this.clearWaitTimer();
    this.setState({
      sessionKey: "",
      testLoading: false,
      replyLoading: false,
      statusText: "",
    });
  }

  stopTest() {
    const sessionKey = this.state.sessionKey;
    if (sessionKey === "") {
      return;
    }
    ProviderBackend.stopWeChatIlinkTest(this.getProviderId(), sessionKey)
      .then((res) => {
        if (res.status === "ok") {
          Setting.showMessage("success", i18next.t("provider:WeChat test stopped"));
        } else {
          Setting.showMessage("error", `${i18next.t("general:Failed to save")}: ${res.msg}`);
        }
      })
      .catch((error) => {
        Setting.showMessage("error", `${i18next.t("general:Failed to connect to server")}: ${error}`);
      })
      .finally(() => {
        if (!this.unmounted) {
          this.stopLocalTestState();
        }
      });
  }

  sendReply() {
    const text = this.state.replyText.trim();
    if (text === "" || this.state.latestMessage === null) {
      return;
    }

    this.setState({replyLoading: true});
    ProviderBackend.replyWeChatIlinkTest(this.getProviderId(), this.state.sessionKey, text, this.state.latestMessage.messageId)
      .then((res) => {
        if (res.status === "ok") {
          Setting.showMessage("success", i18next.t("provider:WeChat reply sent"));
          this.setState({replyText: ""});
        } else {
          Setting.showMessage("error", `${i18next.t("general:Failed to save")}: ${res.msg}`);
        }
      })
      .catch((error) => {
        Setting.showMessage("error", `${i18next.t("general:Failed to connect to server")}: ${error}`);
      })
      .finally(() => {
        if (!this.unmounted) {
          this.setState({replyLoading: false});
        }
      });
  }

  renderLatestMessage() {
    const message = this.state.latestMessage;
    if (message === null) {
      return this.state.statusText;
    }

    return [
      `${i18next.t("provider:From user")}: ${message.fromUserId}`,
      `${i18next.t("provider:Message ID")}: ${message.messageId}`,
      `${i18next.t("provider:Message text")}: ${message.text}`,
    ].join("\n");
  }

  render() {
    const {provider, shouldSaveProviderFirst} = this.props;
    if (!provider || provider.category !== "Chat" || provider.type !== "WeChat iLink Bot") {
      return null;
    }

    const isTesting = this.state.sessionKey !== "";
    const isStartDisabled = shouldSaveProviderFirst || this.state.testLoading;
    return (
      <React.Fragment>
        <Row style={{marginTop: "20px"}} >
          <Col style={{marginTop: "5px"}} span={(Setting.isMobile()) ? 22 : 2}>
            {Setting.getLabel(i18next.t("provider:Provider test"), i18next.t("provider:WeChat provider test - Tooltip"))} :
          </Col>
          <Col span={22}>
            {
              !isTesting ? (
                <Button
                  type="primary"
                  loading={this.state.testLoading}
                  disabled={isStartDisabled}
                  onClick={() => this.startTest()}
                >
                  {i18next.t("provider:Start WeChat test")}
                </Button>
              ) : (
                <Button onClick={() => this.stopTest()}>
                  {i18next.t("provider:Stop WeChat test")}
                </Button>
              )
            }
            {
              shouldSaveProviderFirst ? (
                <span style={{marginLeft: "10px", color: "#999"}}>
                  {i18next.t("provider:Save provider before testing")}
                </span>
              ) : null
            }
          </Col>
        </Row>
        {
          isTesting ? (
            <>
              <Row style={{marginTop: "10px"}}>
                <Col span={2}></Col>
                <Col span={10}>
                  <div style={{marginBottom: "5px"}}><strong>{i18next.t("provider:Latest WeChat message")}:</strong></div>
                  <Input.TextArea value={this.renderLatestMessage()} rows={4} disabled />
                </Col>
              </Row>
              <Row style={{marginTop: "10px"}}>
                <Col span={2}></Col>
                <Col span={10}>
                  <Input.TextArea
                    value={this.state.replyText}
                    rows={3}
                    disabled={this.state.latestMessage === null}
                    placeholder={i18next.t("provider:Manual reply")}
                    onChange={e => this.setState({replyText: e.target.value})}
                  />
                </Col>
                <Col span={6}>
                  <Button
                    style={{marginLeft: "10px"}}
                    type="primary"
                    loading={this.state.replyLoading}
                    disabled={this.state.latestMessage === null || this.state.replyText.trim() === ""}
                    onClick={() => this.sendReply()}
                  >
                    {i18next.t("provider:Send reply")}
                  </Button>
                </Col>
              </Row>
            </>
          ) : null
        }
      </React.Fragment>
    );
  }
}

export default TestWeChatIlinkWidget;
