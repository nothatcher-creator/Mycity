# script.py <scenario> <out.json> <scenes> <loadMs> <refineMs> <hiMs>: final captures: refine at low resolution, switch to 2x, shoot
import sys, json
sc, out = sys.argv[1], sys.argv[2]
scenes = [int(x) for x in sys.argv[3].split(',')]
load, refine, hi = int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])
order = ['planet', 'orbit', 'moon', 'rocks', 'empty']
st = [{"wait": 2500}]
for i in range(order.index(sc) + 1):
    if i: st += [{"press": ["F8", 100]}, {"wait": 600}]
    st += [{"key": ["F9", True]}, {"wait": 150}, {"key": ["F9", False]}, {"wait": 2500}]
cur = -1
first = True
for n in scenes:
    k = n - cur
    for _ in range(k): st += [{"press": ["Numpad9", 100]}, {"wait": 400}]
    cur = n
    st += [{"wait": (load if first else 0) + refine}, {"press": ["Numpad0", 100]}, {"wait": hi}, {"shot": f"{sc}{n}"}, {"press": ["Numpad0", 100]}, {"wait": 1500}]
    first = False
json.dump(st, open(out, 'w'))
