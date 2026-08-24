#!/usr/bin/env python3
# OCR dedicado con PaddleOCR (PP-OCRv4, español). Motor real de OCR: lee lo
# impreso en el DNI, NO alucina datos como los VLM (moondream). Corre en CPU en
# 1-3s. Salida JSON a stdout para que la lea el wrapper de Node.
#
# Uso:
#   _paddleOcr.py --check   -> prueba import, imprime OK/NO (avail check)
#   _paddleOcr.py --warmup  -> instancia + corre sobre imagen dummy para bajar
#                              los modelos la 1ra vez (durante la ventana de internet)
#   _paddleOcr.py <path>    -> OCR de la imagen, imprime {"lines":[{"text","conf"}]}
import sys, json


def main():
    args = sys.argv[1:]

    if args and args[0] == '--check':
        try:
            import paddleocr  # noqa
            print('OK')
        except Exception:
            print('NO')
        return

    if args and args[0] == '--warmup':
        try:
            import numpy as np
            from paddleocr import PaddleOCR
            ocr = PaddleOCR(use_angle_cls=True, lang='es', use_gpu=False, show_log=False)
            ocr.ocr(np.ones((50, 200, 3), dtype='uint8') * 255, cls=True)
            print('OK')
        except Exception as e:
            print('NO: ' + str(e))
        return

    if not args:
        print(json.dumps({'error': 'falta path de imagen'}))
        return

    img = args[0]
    try:
        from paddleocr import PaddleOCR
        ocr = PaddleOCR(use_angle_cls=True, lang='es', use_gpu=False, show_log=False)
        res = ocr.ocr(img, cls=True)
        lines = []
        if res:
            for page in res:
                if not page:
                    continue
                for item in page:
                    txt, conf = '', 0.0
                    # PaddleOCR 2.7.x: [box, (text, conf)]
                    if isinstance(item, list) and len(item) >= 2:
                        info = item[1]
                        if isinstance(info, (list, tuple)) and len(info) >= 2:
                            txt, conf = str(info[0]), float(info[1])
                        elif isinstance(info, str):
                            txt = info
                    # 3.x: dict con 'text'/'score'
                    elif isinstance(item, dict):
                        txt = str(item.get('text', ''))
                        try:
                            conf = float(item.get('score', 0) or 0)
                        except Exception:
                            conf = 0.0
                    if txt:
                        lines.append({'text': txt, 'conf': conf})
        print(json.dumps({'lines': lines}))
    except Exception as e:
        print(json.dumps({'error': str(e)}))


if __name__ == '__main__':
    main()