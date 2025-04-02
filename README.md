
# Spleeter Web 应用

这是一个基于 Flask 和 Spleeter 的 Web 应用，用于音频分离、分析和副歌提取。

## 功能特点

- 音频文件上传和处理
- YouTube 链接音频下载和处理
- 音频分离（2轨、4轨、5轨）
- 音频分析（BPM、调式识别）
- 和弦提取
- 分离后的音轨在线播放和下载

## 环境要求

- Python 3.8+
- FFmpeg
- 足够的内存（特别是对于4轨和5轨分离）

## 安装步骤

1. 克隆或下载本仓库
2. 创建并激活 conda 环境
   ```bash
   conda create -n spleeter python=3.8
   conda activate spleeter
   ```
3. 安装依赖项
   ```bash
   pip install -r requirements.txt
   ```
4. 下载预训练模型  
   预训练模型应放置在 `pretrained_models` 文件夹中，结构如下：
   ```
   pretrained_models/
   ├── 2stems/
   ├── 4stems/
   └── 5stems/
   ```
5. 运行应用
   ```bash
   python app.py
   ```
6. 在浏览器中访问 http://127.0.0.1:5000

## 常见问题及解决方案

1. ​**依赖项冲突**  
   推荐版本组合：
   ```python
   numpy==1.21.6
   numba==0.53.1
   librosa==0.8.1
   spleeter==2.3.0
   ```
   升级 numpy：
   ```bash
   pip install numpy==1.21.6
   ```

2. ​**内存不足**  
   已优化为使用外部进程处理高内存需求任务

3. ​**预训练模型路径问题**  
   设置环境变量：`SPLEETER_MODELS_PATH=pretrained_models`

4. ​**CUDA 相关警告**  
   自动回退到 CPU 模式运行

## 项目结构

```
spleeter/
├── app.py                # 主应用文件
├── requirements.txt      # 依赖项列表
├── static/               # 静态文件（CSS、JS）
├── templates/            # HTML 模板
├── uploads/              # 上传和处理的音频文件
└── pretrained_models/    # Spleeter 预训练模型
```

## 技术栈

- Flask: Web 框架
- Spleeter: 音频分离库
- librosa: 音频分析
- pychorus: 副歌提取
- youtube-dl: YouTube 下载
- Flask-Dropzone: 文件上传

## 许可证

MIT License