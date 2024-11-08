import cv2
from ultralytics import YOLO
import numpy as np
import argparse
import string
import easyocr
import os
from datetime import datetime
import sys
import csv
import time
import psutil
import GPUtil

# Inicializar o leitor OCR
# reader = easyocr.Reader(['en'], gpu=False)

# Dicionários de mapeamento para conversão de caracteres
dict_char_to_int = {'O': '0', 'I': '1', 'Z': '2', 'J': '3', 'A': '4', 'S': '5', 'G': '6', 'B': '8'}
dict_int_to_char = {'0': 'O', '1': 'I', '2': 'Z', '3': 'J', '4': 'A', '5': 'S', '6': 'G', '8': 'B'}

def license_complies_format(text, plate_class):
    """Verifica se o texto da placa está no formato correto baseado na classe da placa."""
    if plate_class == 'new':
        # Formato Mercosul: ZZZ9Z99
        if len(text) != 7:
            return False

        mapping = [
            dict_int_to_char,  # Caractere 0 - Letra
            dict_int_to_char,  # Caractere 1 - Letra
            dict_int_to_char,  # Caractere 2 - Letra
            dict_char_to_int,  # Caractere 3 - Número
            dict_int_to_char,  # Caractere 4 - Letra
            dict_char_to_int,  # Caractere 5 - Número
            dict_char_to_int   # Caractere 6 - Número
        ]

        for i in range(7):
            if i in [0, 1, 2, 4]:
                valid_chars = string.ascii_uppercase + ''.join(mapping[i].keys())
            else:
                valid_chars = '0123456789' + ''.join(mapping[i].keys())

            if text[i] not in valid_chars:
                return False
        return True

    elif plate_class == 'old':
        # Formato Antigo: ZZZ9999
        if len(text) != 7:
            return False

        mapping = [
            dict_int_to_char,  # Caractere 0 - Letra
            dict_int_to_char,  # Caractere 1 - Letra
            dict_int_to_char,  # Caractere 2 - Letra
            dict_char_to_int,  # Caractere 3 - Número
            dict_char_to_int,  # Caractere 4 - Número
            dict_char_to_int,  # Caractere 5 - Número
            dict_char_to_int   # Caractere 6 - Número
        ]

        for i in range(7):
            if i in [0, 1, 2]:
                valid_chars = string.ascii_uppercase + ''.join(mapping[i].keys())
            else:
                valid_chars = '0123456789' + ''.join(mapping[i].keys())

            if text[i] not in valid_chars:
                return False
        return True

    else:
        # Classe desconhecida
        return False

def format_license(text, plate_class):
    """Formata o texto da placa convertendo caracteres baseado na classe da placa."""
    license_plate_formatted = ''

    if plate_class == 'new':
        # Formato Mercosul: ZZZ9Z99
        mapping = [
            dict_int_to_char,  # Caractere 0 - Letra
            dict_int_to_char,  # Caractere 1 - Letra
            dict_int_to_char,  # Caractere 2 - Letra
            dict_char_to_int,  # Caractere 3 - Número
            dict_int_to_char,  # Caractere 4 - Letra
            dict_char_to_int,  # Caractere 5 - Número
            dict_char_to_int   # Caractere 6 - Número
        ]
    elif plate_class == 'old':
        # Formato Antigo: ZZZ9999
        mapping = [
            dict_int_to_char,  # Caractere 0 - Letra
            dict_int_to_char,  # Caractere 1 - Letra
            dict_int_to_char,  # Caractere 2 - Letra
            dict_char_to_int,  # Caractere 3 - Número
            dict_char_to_int,  # Caractere 4 - Número
            dict_char_to_int,  # Caractere 5 - Número
            dict_char_to_int   # Caractere 6 - Número
        ]
    else:
        # Classe desconhecida
        return text

    for i in range(7):
        char = text[i]
        if char in mapping[i]:
            license_plate_formatted += mapping[i][char]
        else:
            license_plate_formatted += char

    return license_plate_formatted

def preprocess_image(image):
    """
    Pré-processa a imagem para melhorar a precisão do OCR.
    """
    # Converter para escala de cinza
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Remover ruído usando blur gaussiano
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Aumentar o contraste usando equalização de histograma adaptativa
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced = clahe.apply(blurred)

    # Binarizar a imagem usando o método de Otsu
    _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Opcional: Dilatação e erosão para melhorar a definição dos caracteres
    kernel = np.ones((3,3), np.uint8)
    processed_image = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)

    return processed_image

def remove_leading_zero(char):
    """
    Remove o primeiro '0' se o caractere começar com '0' e tiver mais de um caractere.
    
    Args:
        char (str): Caractere detectado.
    
    Returns:
        str: Caractere processado.
    """
    if char.startswith('0') and len(char) > 1:
        return char[1:]
    return char

def read_license_plate(license_plate_crop, plate_class, model):
    """Lê o texto da placa de licença a partir da imagem recortada."""
    # Pré-processar a imagem
    # processed_image = preprocess_image(license_plate_crop)

    # processed_image_resized = cv2.resize(processed_image, None, fx=resize_factor, fy=resize_factor, interpolation=cv2.INTER_AREA)

    # Passar a imagem pré-processada e redimensionada para o OCR
    try:
        # Passar a imagem pré-processada e redimensionada para o OCR
        detections = model.predict(license_plate_crop)
    except Exception as e:
        print(f"Erro durante a predição OCR: {e}")
        return None, None, license_plate_crop

    for detection in detections:
        # Extrair as boxes, classes e confidências
        boxes = detection.boxes
        class_ids = boxes.cls  # IDs das classes
        scores = boxes.conf  # Confiança das detecções
        xyxy = boxes.xyxy  # Coordenadas das boxes

        # Mapeamento de classes para caracteres
        class_names = detection.names  # Dicionário {id: 'char'}

        # Criar uma lista de tuplas (x_min, classe, confiança)
        detections = []

        for box, cls, score in zip(xyxy, class_ids, scores):
            x_min = box[0].item()  # Coordenada x mínima
            char = class_names[int(cls)]
            conf = score.item()
            detections.append((x_min, char, conf))

        # Ordenar as detecções da esquerda para a direita com base em x_min
        detections_sorted = sorted(detections, key=lambda x: x[0])

        # Verificar se há detecções
        if not detections_sorted:
            print("Nenhuma detecção encontrada para esta placa.")
            return None, None, license_plate_crop
        
        # Extrair os caracteres em ordem, removendo o primeiro '0' se aplicável
        plate_number_full = ''.join([remove_leading_zero(char) for _, char, _ in detections_sorted])

        # Calcular a confiança média das detecções
        average_confidence = sum([conf for _, _, conf in detections_sorted]) / len(detections_sorted)
        # confidence_percentage = average_confidence * 100  # Converter para porcentagem

        # Exibir no formato solicitado
        # print(f"{plate_number_full}, confiança: {average_confidence}")
        
        text = plate_number_full
        text = text.upper().replace(' ', '')

        result = {
            'license_plate': {
                'text': plate_number_full,
                'text_score': average_confidence,
            }
        }
        if score > 0.2 and license_complies_format(text, plate_class):
            result['license_plate']['text'] = format_license(text, plate_class)

            return result['license_plate']['text'], result['license_plate']['text_score'], license_plate_crop
    return None, None, license_plate_crop

def sanitize_filename(filename):
    """Remove ou substitui caracteres inválidos para nomes de arquivos."""
    valid_chars = "-_.() %s%s" % (string.ascii_letters, string.digits)
    sanitized = ''.join(c for c in filename if c in valid_chars)
    return sanitized

def measure_performance(model_plate, model_ocr):
    """Mede a performance do processamento de uma imagem estática."""
    image_path = './perf/img.jpg'
    image = cv2.imread(image_path)

    if image is None:
        print(f"Erro: Não foi possível ler a imagem de performance em {image_path}.")
        return

    start_time = time.time()

    # Detectar placas na imagem
    results = model_plate.predict(image_path)

    for box in results[0].boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0])

        plate_class_index = int(box.cls[0])
        if plate_class_index == 0:
            plate_class = 'new'
        elif plate_class_index == 1:
            plate_class = 'old'
        else:
            plate_class = 'unknown'

        license_plate_crop = image[y1:y2, x1:x2]

        read_license_plate(license_plate_crop, plate_class, model_ocr)

    end_time = time.time()

    processing_time = end_time - start_time
    avg_fps = 1 / processing_time if processing_time > 0 else 0

    # Coletar métricas do sistema
    cpu_percent = psutil.cpu_percent(interval=1)
    ram_usage = psutil.virtual_memory().percent

    gpus = GPUtil.getGPUs()
    if gpus:
        gpu = gpus[0]
        gpu_load = gpu.load * 100  # Percentual de uso da GPU
        gpu_memory_usage = gpu.memoryUtil * 100  # Percentual de uso da memória da GPU
    else:
        gpu_load = 0.0
        gpu_memory_usage = 0.0

    # Imprimir o relatório de performance
    print(f"Performance Report: Avg FPS: {avg_fps:.2f}, CPU Usage: {cpu_percent}%, RAM Usage: {ram_usage}%, GPU Usage: {gpu_load:.1f}%, GPU Memory Usage: {gpu_memory_usage:.1f}%")

def main():
    parser = argparse.ArgumentParser(description='Processamento de leitura de placas veiculares.')
    parser.add_argument('--ip', required=True, help='Endereço IP da câmera')
    parser.add_argument('--user', required=True, help='Usuário da câmera')
    parser.add_argument('--password', required=True, help='Senha da câmera')
    parser.add_argument('--frame_rate', type=int, default=3, help='Número de frames a serem processados por segundo')
    parser.add_argument('--device', type=str, default='cpu', help='Device to use for inference (e.g., cpu, cuda:0, cuda:1)')
    args = parser.parse_args()

    # Definir o caminho base
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
    else:
        base_path = os.path.abspath(".")

    # Determine if GPU is to be used
    if args.device.startswith('gpu'):
        device = 'cuda'
    else:
        device = 'cpu'

    plate_model_path = os.path.join(base_path, 'models', 'best_n.pt')
    ocr_model_path = os.path.join(base_path, 'models', 'ocr.pt')

    plate_model = YOLO(plate_model_path)
    plate_model.to(device)

    ocr_model = YOLO(ocr_model_path)
    ocr_model.to(device)

    video_path = f'rtsp://{args.user}:{args.password}@{args.ip}:554/cam/realmonitor?channel=1&subtype=0'
    # video_path = './test.mp4'

    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        print("Erro ao abrir o vídeo")
        sys.exit(1)
    else:
        print("Process Started Successfully")

    fps = cap.get(cv2.CAP_PROP_FPS)

    skip_frames = int(fps / args.frame_rate)

    processing_times = []
    last_perf_measurement_time = time.time()
    frame_count = 0

    plates_dir = os.path.join(base_path, 'plates')
    os.makedirs(plates_dir, exist_ok=True)

    csv_file_path = os.path.join(base_path, 'log.csv')
    csv_file_exists = os.path.isfile(csv_file_path)
    csv_file = open(csv_file_path, 'a', newline='', encoding='utf-8')
    csv_writer = csv.writer(csv_file)

    if not csv_file_exists:
        csv_writer.writerow(['license_text', 'confidence', 'timestamp', 'plate_image_path', 'plate_class'])

    while cap.isOpened():
        ret, frame = cap.read()

        if not ret:
            break

        frame_start_time = time.time()

        start = time.time()

        if frame_count % skip_frames == 0:
            results = plate_model.predict(frame)

            for box in results[0].boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])

                plate_class_index = int(box.cls[0])
                if plate_class_index == 0:
                    plate_class = 'new'
                elif plate_class_index == 1:
                    plate_class = 'old'
                else:
                    plate_class = 'unknown'

                license_plate_crop = frame[y1:y2, x1:x2]

                license_text, confidence, processed_plate_image = read_license_plate(license_plate_crop, plate_class, ocr_model)

                end1 = time.time()
                elapsedTime = end1 - start
                # print('ElapsedTime: ', elapsedTime * 1000)

                if license_text is not None and confidence > 0.2:
                    print(f"LP-//{license_text}//-LP (Class: {plate_class})")

                    sanitized_license_text = sanitize_filename(license_text)

                    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S%f')[:-3]

                    filename_base = f"{sanitized_license_text}_{timestamp}"
                    plate_image_filename = os.path.join(plates_dir, f"{filename_base}.jpg")

                    cv2.imwrite(plate_image_filename, processed_plate_image)

                    csv_writer.writerow([license_text, confidence, timestamp, plate_image_filename, plate_class])
                    csv_file.flush()

        end = time.time()

        totalTime = end - start

        # print('Total Time: ', totalTime)

        frame_count += 1

        frame_processing_time = time.time() - frame_start_time
        processing_times.append(frame_processing_time)

        current_time = time.time()

        # Medição de performance a cada 5 segundos
        if current_time - last_perf_measurement_time >= 5.0:
            measure_performance(plate_model, ocr_model)
            last_perf_measurement_time = current_time

    cap.release()
    cv2.destroyAllWindows()
    csv_file.close()

if __name__ == "__main__":
    main()
    # try:
    #     main()
    # except Exception as e:
    #     print(f"Ocorreu um erro: {e}")
    #     sys.exit(1)