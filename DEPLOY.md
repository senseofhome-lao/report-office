# ຄູ່ມືການ Deploy ໄປ Vercel

## ຂັ້ນຕອນທີ 1: ສ້າງ Neon Database (ຟຣີ)

1. ໄປທີ່ **https://neon.tech** → Sign Up
2. Create new project → ຕັ້ງຊື່ `ldb-bank`
3. ຫຼັງຈາກສ້າງ → Copy **Connection string** (DATABASE_URL)
   - ຮູບແບບ: `postgresql://user:pass@host/dbname?sslmode=require`

## ຂັ້ນຕອນທີ 2: ສ້າງ Cloudinary Account (ຟຣີ - ສຳລັບ upload ໄຟລ)

1. ໄປທີ່ **https://cloudinary.com** → Sign Up ຟຣີ
2. Dashboard → Copy:
   - `Cloud name`
   - `API Key`
   - `API Secret`

## ຂັ້ນຕອນທີ 3: Deploy ໄປ Vercel

1. ໄປທີ່ **https://vercel.com** → Sign Up / Login ດ້ວຍ GitHub
2. ກົດ **"Add New Project"**
3. Import `report-office` ຈາກ GitHub
4. ກ່ອນ Deploy → ໄປ **"Environment Variables"** → ເພີ່ມ:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | (paste ຈາກ Neon) |
| `JWT_SECRET` | (ຕົວອັກສອນສຸ່ມ ຍາວ 32+ ຕົວ) |
| `CLOUDINARY_CLOUD_NAME` | (ຈາກ Cloudinary) |
| `CLOUDINARY_API_KEY` | (ຈາກ Cloudinary) |
| `CLOUDINARY_API_SECRET` | (ຈາກ Cloudinary) |
| `NODE_ENV` | `production` |

5. ກົດ **Deploy** → ລໍຖ້າ ~1 ນາທີ

## ບັນຊີເລີ່ມຕົ້ນ

| ຊື່ຜູ້ໃຊ້ | ລະຫັດ | ສິດ |
|---|---|---|
| `admin` | `admin123` | ຜູ້ບໍລິຫານ |
| `user1` | `user123` | ຜູ້ປ້ອນຂໍ້ມູນ |

> ⚠️ ກ່ຽວກັບຄວາມປອດໄພ: ກ່ຽວກັບຄວາມປອດໄພ: ກ່ຽວກັບຄວາມປອດໄພ: ຄວນ ປ່ຽນລະຫັດ ຫຼັງ deploy ສຳເລັດ!

## ທົດສອບ Local (ຕ້ອງມີ Neon URL ກ່ອນ)

1. ແກ້ໄຂ `.env` → paste `DATABASE_URL` ຈາກ Neon
2. ລັນ: `node server.js`
3. ເປີດ: http://localhost:3000
