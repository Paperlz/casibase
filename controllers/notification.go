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

package controllers

import (
	"github.com/beego/beego/utils/pagination"
	"github.com/the-open-agent/openagent/object"
	"github.com/the-open-agent/openagent/util"
)

// GetNotifications
// @Title GetNotifications
// @Tag Notification API
// @Description get notification sending records
// @Param p query string false "The page number"
// @Param pageSize query string false "The page size"
// @Param field query string false "The field to search"
// @Param value query string false "The value to search"
// @Param sortField query string false "The field to sort by"
// @Param sortOrder query string false "The sort order"
// @Success 200 {array} object.Notification The Response object
// @router /get-notifications [get]
func (c *ApiController) GetNotifications() {
	limit := c.Input().Get("pageSize")
	page := c.Input().Get("p")
	field := c.Input().Get("field")
	value := c.Input().Get("value")
	sortField := c.Input().Get("sortField")
	sortOrder := c.Input().Get("sortOrder")

	if _, ok := c.RequireSignedIn(); !ok {
		return
	}
	if !c.IsGlobalAdmin() && !c.IsStoreAdmin() {
		c.ResponseError(c.T("auth:Unauthorized operation"))
		return
	}

	if limit == "" || page == "" {
		limit = "50"
		page = "1"
	}

	limitInt, err := util.ParseIntWithError(limit)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	if c.IsGlobalAdmin() {
		count, err := object.GetNotificationCount("", field, value)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
		paginator := pagination.SetPaginator(c.Ctx, limitInt, count)
		notifications, err := object.GetPaginationNotifications("", paginator.Offset(), limitInt, field, value, sortField, sortOrder)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
		c.ResponseOk(notifications, paginator.Nums())
		return
	}

	username := c.GetSessionUsername()
	count, err := object.GetNotificationCount(username, field, value)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	paginator := pagination.SetPaginator(c.Ctx, limitInt, count)
	notifications, err := object.GetPaginationNotifications(username, paginator.Offset(), limitInt, field, value, sortField, sortOrder)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(notifications, paginator.Nums())
}
