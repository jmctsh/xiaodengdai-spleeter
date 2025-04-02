import os
import subprocess
import sys
import uuid
from pathlib import Path

import librosa
import numpy as np
import youtube_dl
from flask import Flask, render_template, request, jsonify, send_file, url_for, redirect
from flask_dropzone import Dropzone
from flask_wtf.csrf import CSRFProtect
from spleeter.separator import Separator
import soundfile as sf

# 设置 spleeter 预训练模型路径
os.environ['SPLEETER_MODELS_PATH'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pretrained_models')

# 初始化Flask应用
app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(24)
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
app.config['DROPZONE_UPLOAD_MULTIPLE'] = False
app.config['DROPZONE_ALLOWED_FILE_CUSTOM'] = True
app.config['DROPZONE_ALLOWED_FILE_TYPE'] = '.mp3, .wav, .ogg, .m4a, .flac'
app.config['DROPZONE_MAX_FILE_SIZE'] = 100
app.config['DROPZONE_MAX_FILES'] = 1

# 初始化CSRF保护和Dropzone
csrf = CSRFProtect(app)
dropzone = Dropzone(app)

# 确保上传文件夹存在
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# 存储处理后的音频文件和分析结果
processed_files = {}


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload():
    if 'file' in request.files:
        file = request.files['file']
        if file.filename != '':
            # 生成唯一ID并保存文件
            file_id = str(uuid.uuid4())
            filename = file_id + os.path.splitext(file.filename)[1]
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)

            # 存储文件信息
            processed_files[file_id] = {
                'original_path': filepath,
                'original_name': file.filename,
                'stems': {}
            }

            return jsonify({
                'status': 'success',
                'file_id': file_id,
                'message': f'文件 {file.filename} 上传成功'
            })

    return jsonify({'status': 'error', 'message': '上传失败'})


@app.route('/process_url', methods=['POST'])
def process_url():
    url = request.form.get('url')
    if not url:
        return jsonify({'status': 'error', 'message': '请提供有效的URL'})

    try:
        # 生成唯一ID
        file_id = str(uuid.uuid4())
        download_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{file_id}.mp3")

        # 使用youtube-dl下载音频
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': download_path.replace('.mp3', ''),
        }

        with youtube_dl.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get('title', 'downloaded_audio')

        # 获取下载后的文件路径
        filepath = download_path.replace('.mp3', '') + '.mp3'

        # 存储文件信息
        processed_files[file_id] = {
            'original_path': filepath,
            'original_name': title,
            'stems': {}
        }

        return jsonify({
            'status': 'success',
            'file_id': file_id,
            'message': f'音频 {title} 下载成功'
        })

    except Exception as e:
        return jsonify({'status': 'error', 'message': f'下载失败: {str(e)}'})

@app.route('/separate', methods=['POST'])
def separate():
    file_id = request.form.get('file_id')
    stems = request.form.get('stems', '2stems')

    if file_id not in processed_files:
        return jsonify({'status': 'error', 'message': '文件不存在'})

    try:
        file_info = processed_files[file_id]
        input_path = file_info['original_path']
        output_dir = os.path.join(app.config['UPLOAD_FOLDER'], file_id)
        os.makedirs(output_dir, exist_ok=True)

        # 创建输出文件夹
        stem_folder = os.path.join(output_dir, os.path.splitext(os.path.basename(input_path))[0])
        os.makedirs(stem_folder, exist_ok=True)

        # 获取stems数量
        stems_count = int(stems.replace('stems', ''))

        # 添加详细日志
        print(f"开始分离音频: {input_path}")
        print(f"分离轨道数: {stems_count}")
        print(f"输出目录: {stem_folder}")
        print(f"预训练模型路径: {os.environ.get('SPLEETER_MODELS_PATH', '默认路径')}")

        # 检查预训练模型文件是否存在
        model_path = os.path.join(os.environ.get('SPLEETER_MODELS_PATH', ''), f"{stems_count}stems")
        if not os.path.exists(model_path):
            print(f"警告: 预训练模型路径不存在: {model_path}")
            # 尝试创建模型目录
            os.makedirs(model_path, exist_ok=True)

        try:
            # 对于4轨和5轨，使用外部进程处理以避免内存问题
            if stems_count >= 4:
                print("使用外部进程进行分离...")
                # 创建命令
                cmd = [
                    sys.executable,
                    "-m",
                    "spleeter",
                    "separate",
                    "-p",
                    f"spleeter:{stems_count}stems",
                    "-o",
                    os.path.dirname(stem_folder),
                    input_path
                ]

                # 设置环境变量
                env = os.environ.copy()
                env['SPLEETER_MODELS_PATH'] = os.environ.get('SPLEETER_MODELS_PATH', '')

                # 执行命令
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    env=env
                )
                stdout, stderr = process.communicate()

                # 检查命令执行结果
                if process.returncode != 0:
                    print(f"外部进程执行失败: {stderr.decode('utf-8', errors='ignore')}")
                    return jsonify(
                        {'status': 'error', 'message': f'分离失败: {stderr.decode("utf-8", errors="ignore")}'})

                print("外部进程执行成功")
            else:
                # 对于2轨，使用内部API
                # 创建分离器
                separator = Separator(f'spleeter:{stems_count}stems')

                # 执行分离
                prediction = separator.separate_to_file(
                    input_path,
                    os.path.dirname(stem_folder),
                    filename_format='{instrument}.{codec}'
                )

            print("音频分离完成")

            # 确定输出的音轨名称
            if stems_count == 2:
                output_stems = ['vocals', 'accompaniment']
            elif stems_count == 4:
                output_stems = ['vocals', 'drums', 'bass', 'other']
            elif stems_count == 5:
                output_stems = ['vocals', 'drums', 'bass', 'piano', 'other']
            else:
                return jsonify({'status': 'error', 'message': f'不支持的stems数量: {stems_count}'})

            # 存储分离后的文件路径
            file_info['stems'] = {}

            # 获取实际的输出文件夹名称
            actual_output_folder = os.path.join(os.path.dirname(stem_folder),
                                                os.path.basename(input_path).split('.')[0])
            print(f"检查输出文件夹: {actual_output_folder}")

            for stem in output_stems:
                stem_path = os.path.join(actual_output_folder, f"{stem}.wav")
                if os.path.exists(stem_path):
                    file_info['stems'][stem] = stem_path
                    print(f"找到音轨文件: {stem_path}")
                else:
                    print(f"警告: 未找到分离后的音轨文件: {stem_path}")

            # 分析音频特性
            y_mono, sr = librosa.load(input_path, mono=True)

            # 提取BPM
            tempo, _ = librosa.beat.beat_track(y=y_mono, sr=sr)

            # 提取调式
            chroma = librosa.feature.chroma_cqt(y=y_mono, sr=sr)
            key_indices = np.sum(chroma, axis=1)
            key_index = np.argmax(key_indices)
            keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
            key = keys[key_index]

            # 判断大小调
            minor_mask = np.roll(np.array([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0]), key_index)
            major_mask = np.roll(np.array([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1]), key_index)

            minor_sum = np.sum(chroma * minor_mask.reshape(-1, 1))
            major_sum = np.sum(chroma * major_mask.reshape(-1, 1))

            # 确定调式
            mode = 'minor' if minor_sum > major_sum else 'major'
            key_with_mode = f"{key}{' minor' if mode == 'minor' else ''}"

            # 存储分析结果
            file_info['analysis'] = {
                'bpm': round(tempo),
                'key': key_with_mode,
                'time_signature': '4/4'  # 默认为4/4拍
            }cd d:\spleeter

            return jsonify({
                'status': 'success',
                'file_id': file_id,
                'message': '音频分离成功',
                'redirect': url_for('player', file_id=file_id)
            })
        except Exception as e:
            print(f"分离器错误: {str(e)}")
            import traceback
            print(traceback.format_exc())
            return jsonify({'status': 'error', 'message': f'分离器错误: {str(e)}'})

    except Exception as e:
        import traceback
        print(f"分离失败: {str(e)}")
        print(traceback.format_exc())
        return jsonify({'status': 'error', 'message': f'分离失败: {str(e)}'})

@app.route('/player/<file_id>')
def player(file_id):
    if file_id not in processed_files:
        return redirect(url_for('index'))

    file_info = processed_files[file_id]
    return render_template('player.html',
                           file_id=file_id,
                           file_info=file_info,
                           stems=file_info['stems'],
                           analysis=file_info.get('analysis', {}),
                           original_name=file_info['original_name'])


@app.route('/audio/<file_id>/<stem>')
def get_audio(file_id, stem):
    if file_id not in processed_files or stem not in processed_files[file_id]['stems']:
        return jsonify({'status': 'error', 'message': '文件不存在'})

    return send_file(processed_files[file_id]['stems'][stem])


@app.route('/download/<file_id>/<stem>')
def download_audio(file_id, stem):
    if file_id not in processed_files or stem not in processed_files[file_id]['stems']:
        return jsonify({'status': 'error', 'message': '文件不存在'})

    stem_path = processed_files[file_id]['stems'][stem]
    return send_file(stem_path, as_attachment=True, download_name=f"{stem}.wav")


@app.route('/extract_chorus/<file_id>')
def extract_chorus(file_id):
    if file_id not in processed_files:
        return jsonify({'status': 'error', 'message': '文件不存在'})

    try:
        file_info = processed_files[file_id]
        input_path = file_info['original_path']
        output_dir = os.path.join(app.config['UPLOAD_FOLDER'], file_id)

        # 创建输出文件夹
        chorus_folder = os.path.join(output_dir, "chorus")
        os.makedirs(chorus_folder, exist_ok=True)

        # 提取副歌
        chorus_path = os.path.join(chorus_folder, "chorus.wav")

        # 使用 pychorus 0.1 版本提取副歌
        try:
            # 导入 pychorus 0.1 版本的模块
            from pychorus.similarity import TimeSeriesSimilarity

            # 使用 TimeSeriesSimilarity 分析音频
            similarity_analyzer = TimeSeriesSimilarity(input_path)
            chorus_start_sec = similarity_analyzer.find_chorus()

            if chorus_start_sec is not None:
                # 提取副歌部分并保存
                y, sr = librosa.load(input_path, sr=None)
                chorus_length = 20  # 假设副歌长度为20秒
                start_sample = int(chorus_start_sec * sr)
                end_sample = start_sample + int(chorus_length * sr)

                # 确保不超出音频长度
                if end_sample > len(y):
                    end_sample = len(y)

                chorus_audio = y[start_sample:end_sample]
                sf.write(chorus_path, chorus_audio, sr)
        except Exception as e:
            print(f"使用 pychorus 提取副歌失败: {str(e)}")
            return jsonify({'status': 'error', 'message': '副歌提取失败，pychorus库错误'})

        if chorus_start_sec is not None:
            # 存储副歌信息
            file_info['chorus'] = {
                'path': chorus_path,
                'start_time': chorus_start_sec
            }

            return jsonify({
                'status': 'success',
                'message': f'副歌提取成功，开始时间: {chorus_start_sec:.2f}秒',
                'chorus_path': url_for('get_chorus', file_id=file_id)
            })
        else:
            return jsonify({'status': 'error', 'message': '无法识别副歌部分'})

    except Exception as e:
        import traceback
        print(f"副歌提取失败: {str(e)}")
        print(traceback.format_exc())
        return jsonify({'status': 'error', 'message': f'副歌提取失败: {str(e)}'})


@app.route('/chorus/<file_id>')
def get_chorus(file_id):
    if file_id not in processed_files or 'chorus' not in processed_files[file_id]:
        return jsonify({'status': 'error', 'message': '副歌不存在'})

    return send_file(processed_files[file_id]['chorus']['path'])


if __name__ == '__main__':
    app.run(debug=True, port=5000)