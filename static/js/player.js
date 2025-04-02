// 播放器页面JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // 获取所有音频元素和控制元素
    const audioElements = {};
    const stemElements = document.querySelectorAll('.stem-track audio');
    stemElements.forEach(audio => {
        const stem = audio.id.replace('audio-', '');
        audioElements[stem] = {
            element: audio,
            volume: 1.0,
            muted: false,
            soloed: false
        };
    });
    
    // 播放控制按钮
    const playAllBtn = document.getElementById('playAll');
    const stopAllBtn = document.getElementById('stopAll');
    const progressBar = document.getElementById('progressBar');
    const currentTimeDisplay = document.getElementById('currentTime');
    const durationDisplay = document.getElementById('duration');
    
    // 和弦显示区域
    const chordDisplay = document.getElementById('chordDisplay');
    const chordItems = document.querySelectorAll('.chord-item');
    
    // 歌词容器
    const lyricsContainer = document.getElementById('lyricsContainer');
    
    // 全局变量
    let isPlaying = false;
    let currentTime = 0;
    let duration = 0;
    let progressInterval;
    
    // 初始化音频元素
    for (const stem in audioElements) {
        const audio = audioElements[stem].element;
        
        // 加载元数据时更新持续时间
        audio.addEventListener('loadedmetadata', function() {
            if (audio.duration > duration) {
                duration = audio.duration;
                durationDisplay.textContent = formatTime(duration);
            }
        });
        
        // 音频结束时停止所有音轨
        audio.addEventListener('ended', function() {
            stopAll();
        });
    }
    
    // 播放所有音轨
    playAllBtn.addEventListener('click', function() {
        if (isPlaying) {
            pauseAll();
        } else {
            playAll();
        }
    });
    
    // 停止所有音轨
    stopAllBtn.addEventListener('click', stopAll);
    
    // 进度条点击事件
    progressBar.parentElement.addEventListener('click', function(e) {
        if (!duration) return;
        
        const rect = this.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const newTime = pos * duration;
        
        seekAll(newTime);
    });
    
    // 音量控制
    const volumeControls = document.querySelectorAll('.volume-control');
    volumeControls.forEach(control => {
        const stem = control.dataset.stem;
        
        control.addEventListener('input', function() {
            const volume = parseInt(this.value) / 100;
            setVolume(stem, volume);
        });
    });
    
    // Solo按钮
    const soloButtons = document.querySelectorAll('.toggle-solo');
    soloButtons.forEach(button => {
        const stem = button.dataset.stem;
        
        button.addEventListener('click', function() {
            toggleSolo(stem);
            this.classList.toggle('active');
        });
    });
    
    // Mute按钮
    const muteButtons = document.querySelectorAll('.toggle-mute');
    muteButtons.forEach(button => {
        const stem = button.dataset.stem;
        
        button.addEventListener('click', function() {
            toggleMute(stem);
            this.classList.toggle('active');
        });
    });
    
    // 播放所有音轨
    function playAll() {
        // 重置所有音轨到相同位置
        const startTime = currentTime;
        
        for (const stem in audioElements) {
            const audio = audioElements[stem].element;
            audio.currentTime = startTime;
            
            // 根据solo/mute状态决定是否播放
            updateAudioState(stem);
            
            // 尝试播放
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.error('播放失败:', error);
                });
            }
        }
        
        isPlaying = true;
        playAllBtn.innerHTML = '<i class="fa fa-pause"></i> 暂停';
        
        // 启动进度更新
        startProgressUpdate();
    }
    
    // 暂停所有音轨
    function pauseAll() {
        for (const stem in audioElements) {
            audioElements[stem].element.pause();
        }
        
        isPlaying = false;
        playAllBtn.innerHTML = '<i class="fa fa-play"></i> 播放全部';
        
        // 停止进度更新
        clearInterval(progressInterval);
    }
    
    // 停止所有音轨
    function stopAll() {
        for (const stem in audioElements) {
            const audio = audioElements[stem].element;
            audio.pause();
            audio.currentTime = 0;
        }
        
        isPlaying = false;
        currentTime = 0;
        playAllBtn.innerHTML = '<i class="fa fa-play"></i> 播放全部';
        progressBar.style.width = '0%';
        currentTimeDisplay.textContent = '0:00';
        
        // 停止进度更新
        clearInterval(progressInterval);
        
        // 重置和弦高亮
        updateChordHighlight(0);
    }
    
    // 设置所有音轨的播放位置
    function seekAll(time) {
        currentTime = time;
        
        for (const stem in audioElements) {
            audioElements[stem].element.currentTime = time;
        }
        
        // 更新进度条和时间显示
        const percent = (time / duration) * 100;
        progressBar.style.width = `${percent}%`;
        currentTimeDisplay.textContent = formatTime(time);
        
        // 更新和弦高亮
        updateChordHighlight(Math.floor(time));
    }
    
    // 设置音轨音量
    function setVolume(stem, volume) {
        if (audioElements[stem]) {
            audioElements[stem].volume = volume;
            audioElements[stem].element.volume = volume;
        }
    }
    
    // 切换Solo状态
    function toggleSolo(stem) {
        // 切换当前音轨的Solo状态
        audioElements[stem].soloed = !audioElements[stem].soloed;
        
        // 检查是否有任何音轨处于Solo状态
        const anySoloed = Object.values(audioElements).some(track => track.soloed);
        
        // 更新所有音轨的状态
        for (const s in audioElements) {
            updateAudioState(s, anySoloed);
        }
    }
    
    // 切换Mute状态
    function toggleMute(stem) {
        audioElements[stem].muted = !audioElements[stem].muted;
        updateAudioState(stem);
    }
    
    // 更新音频状态（根据Solo和Mute设置）
    function updateAudioState(stem, anySoloed) {
        const track = audioElements[stem];
        const audio = track.element;
        
        // 如果没有传入anySoloed参数，则重新计算
        if (anySoloed === undefined) {
            anySoloed = Object.values(audioElements).some(t => t.soloed);
        }
        
        // 决定是否应该静音
        if (track.muted || (anySoloed && !track.soloed)) {
            audio.volume = 0;
        } else {
            audio.volume = track.volume;
        }
    }
    
    // 启动进度更新
    function startProgressUpdate() {
        clearInterval(progressInterval);
        
        progressInterval = setInterval(() => {
            // 使用第一个音轨的当前时间作为参考
            const firstAudio = Object.values(audioElements)[0].element;
            currentTime = firstAudio.currentTime;
            
            // 更新进度条和时间显示
            const percent = (currentTime / duration) * 100;
            progressBar.style.width = `${percent}%`;
            currentTimeDisplay.textContent = formatTime(currentTime);
            
            // 更新和弦高亮
            updateChordHighlight(Math.floor(currentTime));
        }, 100);
    }
    
    // 更新和弦高亮
    function updateChordHighlight(timeInSeconds) {
        // 移除所有和弦的高亮
        chordItems.forEach(item => {
            item.classList.remove('active');
        });
        
        // 找到当前时间对应的和弦并高亮
        const currentChord = document.querySelector(`.chord-item[data-time="${timeInSeconds}"]`);
        if (currentChord) {
            currentChord.classList.add('active');
            
            // 确保当前和弦在视图中可见
            currentChord.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    
    // 格式化时间显示（秒 -> mm:ss）
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    // 模拟歌词数据（实际应用中应从API获取）
    function generateDummyLyrics() {
        const lyrics = [
            { time: 5, text: "这是第一行歌词..." },
            { time: 10, text: "这是第二行歌词..." },
            { time: 15, text: "这是第三行歌词..." },
            { time: 20, text: "这是第四行歌词..." },
            { time: 25, text: "这是第五行歌词..." },
            { time: 30, text: "这是第六行歌词..." },
        ];
        
        // 清空歌词容器
        lyricsContainer.innerHTML = '';
        
        // 添加歌词行
        lyrics.forEach(line => {
            const lineElement = document.createElement('div');
            lineElement.className = 'lyrics-line';
            lineElement.dataset.time = line.time;
            lineElement.textContent = line.text;
            lyricsContainer.appendChild(lineElement);
        });
        
        // 添加歌词更新监听
        if (progressInterval) {
            clearInterval(progressInterval);
        }
        
        progressInterval = setInterval(() => {
            const currentTime = Object.values(audioElements)[0].element.currentTime;
            updateLyrics(currentTime);
        }, 100);
    }
    
    // 更新歌词高亮
    function updateLyrics(currentTime) {
        const lyricsLines = document.querySelectorAll('.lyrics-line');
        
        // 移除所有歌词行的高亮
        lyricsLines.forEach(line => {
            line.classList.remove('active');
        });
        
        // 找到当前时间对应的歌词行
        let currentLine = null;
        lyricsLines.forEach(line => {
            const lineTime = parseInt(line.dataset.time);
            if (lineTime <= currentTime) {
                currentLine = line;
            }
        });
        
        // 高亮当前歌词行
        if (currentLine) {
            currentLine.classList.add('active');
            currentLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    
    // 初始化生成模拟歌词
    generateDummyLyrics();
});