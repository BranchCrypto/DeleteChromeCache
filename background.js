// 后台脚本，处理缓存清理和定时任务

// 监听来自popup的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log("收到消息:", request);
  
  if (request.action === 'clearCurrentSite') {
    // 清除当前站点的缓存
    console.log("处理clearCurrentSite请求:", request.domain, request.dataTypes);
    clearSiteData(request.domain, request.dataTypes, function(result) {
      console.log("清除结果:", result);
      sendResponse(result);
    });
    return true; // 保持消息通道开放，以便异步响应
  } else if (request.action === 'startAutoClean') {
    // 启动定时清理任务
    startAutoCleaning(request.interval, request.dataTypes);
    sendResponse({ success: true });
  } else if (request.action === 'stopAutoClean') {
    // 停止定时清理任务
    stopAutoCleaning();
    sendResponse({ success: true });
  } else if (request.action === 'updateInterval') {
    // 更新定时间隔
    updateCleaningInterval(request.interval, request.dataTypes);
    sendResponse({ success: true });
  }
  return true;
});

// 启动时，如果之前开启了自动清理，则恢复自动清理任务
chrome.runtime.onStartup.addListener(function() {
  restoreAutoCleaningState();
});

// 安装/更新扩展时初始化
chrome.runtime.onInstalled.addListener(function() {
  restoreAutoCleaningState();
});

// 用于存储清除计时器的ID
let autoCleanTimerId = null;

/**
 * 清除指定站点的数据
 * @param {string} domain - 要清除数据的域名
 * @param {Object} dataTypes - 要清除的数据类型
 * @param {function} callback - 回调函数
 */
function clearSiteData(domain, dataTypes, callback) {
  // 确保数据类型有效
  if (!dataTypes || Object.keys(dataTypes).filter(key => dataTypes[key]).length === 0) {
    console.error('没有选择任何数据类型');
    if (callback) callback({ success: false, error: '未选择任何数据类型' });
    return;
  }

  // 获取当前标签页以便稍后刷新
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const currentTab = tabs.length > 0 ? tabs[0] : null;
    
    // 单独处理每种数据类型
    const originUrl = `*://${domain}/*`;
    let completedOperations = 0;
    let totalOperations = 0;
    
    console.log(`正在清除 ${domain} 的缓存数据...`);
    
    // 清除存储数据（localStorage和IndexedDB）
    if (dataTypes.localStorage) {
      totalOperations++;
      chrome.browsingData.removeLocalStorage({ origins: [originUrl] }, function() {
        console.log(`已清除 ${domain} 的localStorage数据`);
        completedOperations++;
        checkCompletion();
      });
    }
    
    // 清除Cookies
    if (dataTypes.cookies) {
      totalOperations++;
      chrome.browsingData.removeCookies({ origins: [originUrl] }, function() {
        console.log(`已清除 ${domain} 的cookies数据`);
        completedOperations++;
        checkCompletion();
      });
    }
    
    // 清除缓存
    if (dataTypes.cache) {
      totalOperations++;
      // 使用更彻底的缓存清除方式，不限制origins
      chrome.browsingData.removeCache({}, function() {
        console.log(`已清除 ${domain} 的缓存数据`);
        completedOperations++;
        checkCompletion();
      });
    }
    
    // 清除历史记录
    if (dataTypes.history) {
      totalOperations++;
      chrome.browsingData.removeHistory({ origins: [originUrl] }, function() {
        console.log(`已清除 ${domain} 的历史记录`);
        completedOperations++;
        checkCompletion();
      });
    }
    
    // 检查是否所有操作都已完成
    function checkCompletion() {
      if (completedOperations === totalOperations) {
        console.log(`所有清除操作已完成`);
        
        // 完成后刷新当前标签页，模拟Ctrl+F5效果
        if (currentTab && dataTypes.cache) {
          reloadTab(currentTab.id);
        }
        
        if (callback) callback({ success: true });
      }
    }
    
    // 如果没有任何操作被执行，直接返回成功
    if (totalOperations === 0) {
      console.log('没有执行任何清除操作');
      if (callback) callback({ success: true });
    }
  });
}

/**
 * 使用类似于Ctrl+F5的方式刷新标签页
 * @param {number} tabId - 要刷新的标签页ID
 */
function reloadTab(tabId) {
  // 使用chrome.tabs.reload API，bypassCache = true模拟Ctrl+F5效果
  chrome.tabs.reload(tabId, { bypassCache: true }, function() {
    console.log(`已刷新标签页 ${tabId}，绕过缓存`);
  });
}

/**
 * 清除当前标签页的数据
 * @param {Object} dataTypes - 要清除的数据类型
 */
function clearCurrentTabData(dataTypes) {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs.length === 0) {
      console.log('未找到活动标签页');
      return;
    }
    
    const currentTab = tabs[0];
    try {
      const url = new URL(currentTab.url);
      const domain = url.hostname;
      
      // 只清除有效域名
      if (domain) {
        console.log(`准备清除当前标签页域名: ${domain}`);
        // 传入一个回调函数，在清除完成后刷新页面
        clearSiteData(domain, dataTypes, function(result) {
          if (result.success && dataTypes.cache) {
            // 已在clearSiteData中处理刷新
          }
        });
      } else {
        console.log('活动标签页没有有效域名');
      }
    } catch (e) {
      console.error('无法处理URL:', currentTab.url, e);
    }
  });
}

/**
 * 启动自动清理功能
 * @param {number} intervalSeconds - 清理间隔（秒）
 * @param {Object} dataTypes - 要清除的数据类型
 */
function startAutoCleaning(intervalSeconds, dataTypes) {
  // 先停止现有的定时任务
  stopAutoCleaning();
  
  console.log(`启动自动清理，间隔: ${intervalSeconds}秒`);
  
  // 保存当前设置
  chrome.storage.sync.set({
    autoCleanState: {
      isEnabled: true,
      interval: intervalSeconds,
      dataTypes: dataTypes,
      lastStartTime: Date.now()
    }
  });
  
  // 创建基于JavaScript的定时器而不是Chrome的alarm API
  // 这样可以支持秒级间隔
  autoCleanTimerId = setInterval(function() {
    console.log('执行定时清理');
    clearCurrentTabData(dataTypes);
  }, intervalSeconds * 1000);
  
  // 立即执行一次清除
  clearCurrentTabData(dataTypes);
}

/**
 * 停止自动清理功能
 */
function stopAutoCleaning() {
  if (autoCleanTimerId !== null) {
    clearInterval(autoCleanTimerId);
    autoCleanTimerId = null;
    console.log('停止自动清理');
  }
  
  // 更新存储的状态
  chrome.storage.sync.set({
    autoCleanState: {
      isEnabled: false
    }
  });
}

/**
 * 更新清理间隔
 * @param {number} intervalSeconds - 新的清理间隔（秒）
 * @param {Object} dataTypes - 要清除的数据类型
 */
function updateCleaningInterval(intervalSeconds, dataTypes) {
  // 检查是否有正在运行的定时器
  if (autoCleanTimerId !== null) {
    console.log(`更新清理间隔: ${intervalSeconds}秒`);
    // 重新启动定时器
    startAutoCleaning(intervalSeconds, dataTypes);
  }
}

/**
 * 恢复自动清理状态
 */
function restoreAutoCleaningState() {
  chrome.storage.sync.get('autoCleanState', function(data) {
    if (data.autoCleanState && data.autoCleanState.isEnabled) {
      console.log('恢复自动清理状态');
      startAutoCleaning(
        data.autoCleanState.interval,
        data.autoCleanState.dataTypes
      );
    }
  });
} 