def own(v):
    t = [sum(v[i:i + 4]) for i in (0, 4, 8, 12)]
    return sum(x == 18 for x in t), -sum(abs(x - 18) for x in t)

def agent(grid):
    v = [c.value for c in grid.cells]
    s, i = max((own(v[:i // 10] + [i % 10] + v[i // 10 + 1:]), i) for i in range(160))
    return [write((i // 40, i // 10 % 4), i % 10)] if s > own(v) else []
