"""Generate realistic demo CSVs for Demo Traders and Corner Store.

The loader creates the two Business accounts through the API, then uploads
these datasets independently to each business. Passwords are entered by the
loader or supplied through environment variables; none are stored here.
"""
import csv
import datetime as dt
import os
import random

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seed_files', 'files')
os.makedirs(OUT, exist_ok=True)
random.seed(42)
START, END = dt.date(2026, 8, 1), dt.date(2026, 10, 31)
SPIKE = dt.date(2026, 9, 15)
CATS = {'Beverages': ['Green Tea 100g', 'Black Tea 250g', 'Instant Coffee 50g', 'Mango Juice 1L', 'Mineral Water 1.5L', 'Cola 1.5L', 'Energy Drink 250ml', 'Milk 1L'],
        'Snacks': ['Potato Chips', 'Salted Peanuts', 'Chocolate Biscuits', 'Cream Crackers', 'Dates 500g', 'Popcorn', 'Chocolate Bar', 'Dry Fruit Mix'],
        'Grocery': ['Basmati Rice 5kg', 'Wheat Flour 10kg', 'Cooking Oil 3L', 'Sugar 1kg', 'Salt 800g', 'Red Lentils 1kg', 'Chickpeas 1kg', 'Spice Mix'],
        'Household': ['Dish Soap', 'Laundry Powder 1kg', 'Floor Cleaner', 'Tissue Box', 'Garbage Bags', 'Hand Wash', 'Toothpaste', 'Shampoo 400ml'],
        'Stationery': ['Notebook A4', 'Ball Pen Pack', 'Marker Set', 'Glue Stick', 'Stapler', 'Sticky Notes', 'Pencil Box', 'Calculator']}
P = []
for cat, items in CATS.items():
    for i, name in enumerate(items):
        price = random.choice([60, 90, 120, 150, 220, 340, 480, 650, 900, 1450]) * (1 + i % 3 * 0.1)
        P.append(dict(sku='%s-%02d' % (cat[:3].upper(), i + 1), name=name, cat=cat, price=round(price), cost=round(price * random.uniform(0.55, 0.8)),
                      pop=random.choice([1, 1, 2, 3, 5])))
CUST = ['CUST-%03d' % i for i in range(1, 61)]

def w(name, header, rows):
    p = os.path.join(OUT, name)
    with open(p, 'w', newline='', encoding='utf-8') as f:
        cw = csv.writer(f); cw.writerow(header); cw.writerows(rows)
    return p
def d(x): return x.strftime('%d/%m/%Y')

def build():
    sales, n, day = [], 1, START
    while day <= END:
        k = random.randint(6, 12) + (3 if day.weekday() in (4, 5) else 0)
        for _ in range(k):
            oid = 'INV-%05d' % n; n += 1; cust = random.choice(CUST) if random.random() < 0.8 else ''
            for p in random.sample(P, random.randint(1, 3)):
                q = random.choice([1, 1, 2, 3]) * (1 if day != SPIKE else 6)
                sales.append((oid, d(day), p['sku'], p['name'], p['cat'], q, p['price'], cust, p['cost']))
        day += dt.timedelta(days=1)
    w('sales.csv', ['Order No', 'Date', 'SKU', 'Item', 'Category', 'Qty', 'Unit Price', 'Customer', 'Cost Price'], sales)
    inv, day, stock = [], START, {p['sku']: random.randint(40, 120) for p in P}
    while day <= END:
        for p in P:
            stock[p['sku']] = max(0, stock[p['sku']] - random.randint(0, 9 * p['pop'] // 2 + 1))
            if stock[p['sku']] < 8 and random.random() < 0.6: stock[p['sku']] += random.randint(60, 120)   # restock
            s = stock[p['sku']]
            if day + dt.timedelta(days=7) > END and p['sku'] in ('GRO-03', 'SNA-02', 'HOU-05'): s = 0     # planted stock-outs
            inv.append((d(day), p['sku'], p['name'], s))
        day += dt.timedelta(days=7)
    w('inventory.csv', ['Date', 'SKU', 'Item', 'Stock'], inv)
    exp = []
    for m in (8, 9, 10):
        for cat, amt in (('Rent', 85000), ('Salaries', 160000), ('Electricity', 24000 if m < 10 else 118000), ('Internet', 4500), ('Transport', 18000)):
            exp.append((d(dt.date(2026, m, 5)), cat, round(amt * random.uniform(0.96, 1.04)), '%s for month %d' % (cat, m)))
        for _ in range(6): exp.append((d(dt.date(2026, m, random.randint(1, 28))), 'Supplies', random.randint(1500, 9000), 'Misc supplies'))
    w('expenses.csv', ['Date', 'Category', 'Amount', 'Description'], exp)
    good = ['Great quality and fast delivery.', 'Fresh stock, will buy again.', 'Price is fair for the quality.', 'Packaging was perfect.', 'Staff are helpful.']
    bad = ['Package arrived damaged.', 'Too expensive compared to the market.', 'Item was out of stock again.', 'Delivery took too long.', 'Expired product received.']
    fb = []
    for i in range(1, 121):
        r = random.choices([1, 2, 3, 4, 5], [10, 10, 15, 30, 35])[0]
        fb.append(('R-%04d' % i, d(START + dt.timedelta(days=random.randint(0, 90))), random.choice(P)['name'], r, random.choice(bad if r <= 2 else good)))
    w('feedback.csv', ['Review ID', 'Date', 'Product', 'Rating', 'Review'], fb)

def main():
    build()
    print('Generated demo CSVs in %s' % OUT)
    print('Run backend/scripts/load_demo_data.py to create the two demo businesses and upload the files.')


if __name__ == '__main__': main()
