document.addEventListener('DOMContentLoaded', function () {
  // 获取DOM元素
  const clearCurrentSiteBtn = document.getElementById('clearCurrentSite');
  const clearStatus = document.getElementById('clearStatus');
  const intervalMinutesInput = document.getElementById('intervalMinutes');
  const intervalSecondsInput = document.getElementById('intervalSeconds');
  const startAutoCleanBtn = document.getElementById('startAutoClean');
  const stopAutoCleanBtn = document.getElementById('stopAutoClean');
  const autoCleanStatus = document.getElementById('autoCleanStatus');
  const currentTitleElement = document.getElementById('currentTitle');
  const currentUrlElement = document.getElementById('currentUrl');
  
  // 获取复选框
  const cookiesCheckbox = document.getElementById('cookies');
  const localStorageCheckbox = document.getElementById('localStorage');
  const cacheCheckbox = document.getElementById('cache');
  const historyCheckbox = document.getElementById('history');
  
  // 初始化时加载保存的设置
  loadSettings();
  
  // 获取并显示当前标签页信息
  updateCurrentSiteInfo();
  
  // 清除当前站点缓存按钮点击事件
  clearCurrentSiteBtn.addEventListener('click', function() {
    clearCurrentSiteCache();
  });
  
  // 开始循环清除按钮点击事件
  startAutoCleanBtn.addEventListener('click', function() {
    startAutoClean();
  });
  
  // 停止循环清除按钮点击事件
  stopAutoCleanBtn.addEventListener('click', function() {
    stopAutoClean();
  });
  
  // 检查自动清除状态
  checkAutoCleanStatus();
  
  // 当数据类型复选框更改时保存设置
  cookiesCheckbox.addEventListener('change', saveSettings);
  localStorageCheckbox.addEventListener('change', saveSettings);
  cacheCheckbox.addEventListener('change', saveSettings);
  historyCheckbox.addEventListener('change', saveSettings);
  
  // 当时间输入更改时保存设置
  intervalMinutesInput.addEventListener('change', saveSettings);
  intervalSecondsInput.addEventListener('change', validateTimeInputs);
  
  // 获取并显示当前标签页信息
  function updateCurrentSiteInfo() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs.length === 0) {
        currentTitleElement.textContent = "无法获取标签信息";
        currentUrlElement.textContent = "-";
        return;
      }
      
      const currentTab = tabs[0];
      
      try {
        // 显示标签标题
        currentTitleElement.textContent = currentTab.title || "无标题";
        
        // 显示网址
        const url = new URL(currentTab.url);
        currentUrlElement.textContent = url.toString();
      } catch (e) {
        console.error('处理URL出错:', e);
        currentTitleElement.textContent = currentTab.title || "无标题";
        currentUrlElement.textContent = "无效URL";
      }
    });
  }
  
  // 验证时间输入
  function validateTimeInputs() {
    const minutes = parseInt(intervalMinutesInput.value, 10) || 0;
    let seconds = parseInt(intervalSecondsInput.value, 10) || 0;
    
    // 确保秒数在1-59之间
    if (minutes === 0 && seconds < 1) {
      seconds = 1;
      intervalSecondsInput.value = 1;
    }
    
    if (seconds > 59) {
      seconds = 59;
      intervalSecondsInput.value = 59;
    }
    
    saveSettings();
  }
  
  // 加载保存的设置
  function loadSettings() {
    chrome.storage.sync.get({
      intervalMinutes: 0,
      intervalSeconds: 30,
      dataTypes: {
        cookies: true,
        localStorage: true,
        cache: true,
        history: false
      }
    }, function(data) {
      // 设置间隔时间
      intervalMinutesInput.value = data.intervalMinutes;
      intervalSecondsInput.value = data.intervalSeconds;
      
      // 设置数据类型复选框
      cookiesCheckbox.checked = data.dataTypes.cookies;
      localStorageCheckbox.checked = data.dataTypes.localStorage;
      cacheCheckbox.checked = data.dataTypes.cache;
      historyCheckbox.checked = data.dataTypes.history;
    });
  }
  
  // 保存设置
  function saveSettings() {
    const settings = {
      intervalMinutes: parseInt(intervalMinutesInput.value, 10) || 0,
      intervalSeconds: parseInt(intervalSecondsInput.value, 10) || 30,
      dataTypes: getSelectedDataTypes()
    };
    
    chrome.storage.sync.set(settings);
    
    // 如果正在运行自动清除，更新时间间隔
    chrome.storage.sync.get('autoCleanState', function(data) {
      if (data.autoCleanState && data.autoCleanState.isEnabled) {
        updateAutoCleanInterval();
      }
    });
  }
  
  // 获取选中的数据类型
  function getSelectedDataTypes() {
    return {
      cookies: cookiesCheckbox.checked,
      localStorage: localStorageCheckbox.checked,
      cache: cacheCheckbox.checked,
      history: historyCheckbox.checked
    };
  }
  
  // 清除当前站点缓存
  function clearCurrentSiteCache() {
    // 检查是否选择了至少一种数据类型
    const dataTypes = getSelectedDataTypes();
    if (!dataTypes.cookies && !dataTypes.localStorage && !dataTypes.cache && !dataTypes.history) {
      clearStatus.textContent = '请选择至少一种数据类型';
      clearStatus.style.color = 'red';
      setTimeout(() => {
        clearStatus.textContent = '';
        clearStatus.style.color = '#4caf50';
      }, 2000);
      return;
    }
    
    // 查询当前标签页
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs.length === 0) {
        clearStatus.textContent = '无法获取当前标签页';
        clearStatus.style.color = 'red';
        return;
      }
      
      const currentTab = tabs[0];
      
      try {
        const url = new URL(currentTab.url);
        const domain = url.hostname;
        
        if (!domain) {
          clearStatus.textContent = '无效的域名';
          clearStatus.style.color = 'red';
          return;
        }
        
        clearStatus.textContent = '正在清除...';
        
        // 为调试添加信息
        console.log(`发送清除请求，域名: ${domain}, 数据类型:`, dataTypes);
        
        // 发送消息到后台脚本
        chrome.runtime.sendMessage({
          action: 'clearCurrentSite',
          domain: domain,
          dataTypes: dataTypes
        }, function(response) {
          // 检查消息通信错误
          if (chrome.runtime.lastError) {
            console.error('发送消息出错:', chrome.runtime.lastError);
            clearStatus.textContent = '清除失败: ' + chrome.runtime.lastError.message;
            clearStatus.style.color = 'red';
            return;
          }
          
          console.log('收到清除响应:', response);
          
          if (response && response.success) {
            clearStatus.textContent = '缓存已清除！';
            setTimeout(() => {
              clearStatus.textContent = '';
            }, 2000);
          } else {
            const errorMsg = response && response.error ? response.error : '请重试';
            clearStatus.textContent = '清除失败，' + errorMsg;
            clearStatus.style.color = 'red';
            setTimeout(() => {
              clearStatus.textContent = '';
              clearStatus.style.color = '#4caf50';
            }, 2000);
          }
        });
      } catch (e) {
        console.error('处理URL出错:', e);
        clearStatus.textContent = '无效的URL';
        clearStatus.style.color = 'red';
      }
    });
  }
  
  // 开始自动清除
  function startAutoClean() {
    // 检查是否选择了至少一种数据类型
    const dataTypes = getSelectedDataTypes();
    if (!dataTypes.cookies && !dataTypes.localStorage && !dataTypes.cache && !dataTypes.history) {
      autoCleanStatus.textContent = '请选择至少一种数据类型';
      autoCleanStatus.style.color = 'red';
      setTimeout(() => {
        autoCleanStatus.textContent = '';
        autoCleanStatus.style.color = '#4caf50';
      }, 2000);
      return;
    }
    
    const minutes = parseInt(intervalMinutesInput.value, 10) || 0;
    const seconds = parseInt(intervalSecondsInput.value, 10) || 30;
    
    // 确保至少有1秒的间隔
    if (minutes === 0 && seconds < 1) {
      intervalSecondsInput.value = 1;
    }
    
    // 计算总秒数
    const totalSeconds = (minutes * 60) + seconds;
    
    chrome.runtime.sendMessage({
      action: 'startAutoClean',
      interval: totalSeconds,
      dataTypes: dataTypes
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('发送消息出错:', chrome.runtime.lastError);
        autoCleanStatus.textContent = '启动失败: ' + chrome.runtime.lastError.message;
        autoCleanStatus.style.color = 'red';
        return;
      }
      
      if (response && response.success) {
        updateAutoCleanUI(true);
      }
    });
  }
  
  // 停止自动清除
  function stopAutoClean() {
    chrome.runtime.sendMessage({
      action: 'stopAutoClean'
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('发送消息出错:', chrome.runtime.lastError);
        autoCleanStatus.textContent = '停止失败: ' + chrome.runtime.lastError.message;
        autoCleanStatus.style.color = 'red';
        return;
      }
      
      if (response && response.success) {
        updateAutoCleanUI(false);
      }
    });
  }
  
  // 更新自动清除时间间隔
  function updateAutoCleanInterval() {
    const minutes = parseInt(intervalMinutesInput.value, 10) || 0;
    const seconds = parseInt(intervalSecondsInput.value, 10) || 30;
    const totalSeconds = (minutes * 60) + seconds;
    
    chrome.runtime.sendMessage({
      action: 'updateInterval',
      interval: totalSeconds,
      dataTypes: getSelectedDataTypes()
    });
  }
  
  // 检查自动清除状态
  function checkAutoCleanStatus() {
    chrome.storage.sync.get('autoCleanState', function(data) {
      if (data.autoCleanState && data.autoCleanState.isEnabled) {
        updateAutoCleanUI(true);
      } else {
        updateAutoCleanUI(false);
      }
    });
  }
  
  // 更新自动清除UI
  function updateAutoCleanUI(isEnabled) {
    if (isEnabled) {
      startAutoCleanBtn.disabled = true;
      stopAutoCleanBtn.disabled = false;
      autoCleanStatus.textContent = '循环清除运行中...';
      autoCleanStatus.style.color = '#4caf50';
    } else {
      startAutoCleanBtn.disabled = false;
      stopAutoCleanBtn.disabled = true;
      autoCleanStatus.textContent = '';
    }
  }
}); 