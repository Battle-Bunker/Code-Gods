def near(t, k):
    return sum(x == k for x in t), -sum(abs(x - k) for x in t)

def rules(v):
    return (near([sum(v[i:i + 4]) for i in (0, 4, 8, 12)], 18),
            near([v[i] + v[15 - i] for i in range(8)], 9),
            sum(abs(v[i] - v[i + 2]) == 1 for i in range(14) if i % 4 < 2))

def agent(grid):
    v = [c.value for c in grid.cells]
    a, b, c = rules(v)
    s, i = max((x, i) for i in range(160) for x, y, z in [rules(v[:i // 10] + [i % 10] + v[i // 10 + 1:])] if y >= b and z >= c)
    return [write((i // 40, i // 10 % 4), i % 10)] if s > a else []
