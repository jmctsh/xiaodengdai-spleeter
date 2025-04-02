// 初始化Dropzone
Dropzone.autoDiscover = false;

document.addEventListener('DOMContentLoaded', function() {
    // 获取CSRF令牌
    const getCsrfToken = function() {
        // 尝试从meta标签获取
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        if (metaTag) {
            return metaTag.getAttribute('content');
        }
        // 尝试从cookie获取
        return document.cookie.split('; ')
            .find(row => row.startsWith('csrf_token='))
            ?.split('=')[1];
    };
    
    const csrfToken = getCsrfToken();
    // 初始化文件上传区域
    const myDropzone = new Dropzone("#dropzoneForm", {
        paramName: "file",
        maxFilesize: 100, // MB
        acceptedFiles: ".mp3,.wav,.ogg,.m4a,.flac",
        autoProcessQueue: true,
        dictDefaultMessage: "拖放音频文件到这里或点击上传",
        headers: {
            'X-CSRFToken': csrfToken
        },
        sending: function(file, xhr, formData) {
            formData.append("csrf_token", csrfToken);
        },
        init: function() {
            this.on("success", function(file, response) {
                if (response.status === 'success') {
                    // 显示分离选项
                    document.getElementById('fileId').value = response.file_id;
                    document.getElementById('separationOptions').style.display = 'block';
                    
                    // 显示成功消息
                    showStatus('success', response.message);
                } else {
                    showStatus('danger', response.message);
                }
            });
            
            this.on("error", function(file, errorMessage) {
                showStatus('danger', typeof errorMessage === 'string' ? errorMessage : '上传失败');
            });
        }
    });
    
    // URL表单提交处理
    document.getElementById('urlForm').addEventListener('submit', function(e) {
        e.preventDefault();
        
        const videoUrl = document.getElementById('videoUrl').value;
        if (!videoUrl) {
            showStatus('danger', '请输入有效的URL');
            return;
        }
        
        // 显示处理中状态
        showStatus('info', '正在下载音频，请稍候...', true);
        
        // 发送URL处理请求
        fetch('/process_url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-CSRFToken': csrfToken
            },
            body: new URLSearchParams({
                'url': videoUrl,
                'csrf_token': csrfToken
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // 显示分离选项
                document.getElementById('fileId').value = data.file_id;
                document.getElementById('separationOptions').style.display = 'block';
                
                // 显示成功消息
                showStatus('success', data.message);
            } else {
                showStatus('danger', data.message);
            }
        })
        .catch(error => {
            showStatus('danger', '处理失败: ' + error.message);
        });
    });
    
    // 分离表单提交处理
    document.getElementById('separationForm').addEventListener('submit', function(e) {
        e.preventDefault();
        
        const fileId = document.getElementById('fileId').value;
        const stems = document.querySelector('input[name="stems"]:checked').value;
        
        if (!fileId) {
            showStatus('danger', '请先上传文件或提供URL');
            return;
        }
        
        // 显示处理中状态
        showStatus('info', '正在进行音轨分离，这可能需要几分钟时间...', true);
        
        // 发送分离请求
        fetch('/separate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-CSRFToken': csrfToken
            },
            body: new URLSearchParams({
                'file_id': fileId,
                'stems': stems
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // 显示成功消息并跳转
                showStatus('success', data.message);
                setTimeout(() => {
                    window.location.href = data.redirect;
                }, 1000);
            } else {
                showStatus('danger', data.message);
            }
        })
        .catch(error => {
            showStatus('danger', '处理失败: ' + error.message);
        });
    });
    
    // 辅助函数：显示状态消息
    function showStatus(type, message, loading = false) {
        const statusAlert = document.getElementById('statusAlert');
        const statusMessage = document.getElementById('statusMessage');
        
        statusAlert.className = `alert alert-${type}`;
        statusMessage.textContent = message;
        
        // 显示或隐藏加载动画
        const spinner = statusAlert.querySelector('.spinner-border');
        if (spinner) {
            spinner.style.display = loading ? 'inline-block' : 'none';
        }
        
        statusAlert.style.display = 'block';
    }
});