-- ============================================================================
-- SWIMS Seed — Discipline Handbook (Buku Pedoman Disiplin)
-- Run AFTER 022_create_discipline_handbook.sql
-- ============================================================================

-- 1. Education Levels
INSERT INTO discipline_education_levels (code, name, sort_order) VALUES
  ('TK',  'Taman Kanak-Kanak / KB', 1),
  ('SD',  'Sekolah Dasar',          2),
  ('SMP', 'Sekolah Menengah Pertama', 3),
  ('SMA', 'Sekolah Menengah Atas',  4)
ON CONFLICT (code) DO NOTHING;

-- 2. Categories (4 Tingkatan)
INSERT INTO discipline_categories (id, name, general_description, characteristics, impact_victim, impact_perpetrator, impact_school)
VALUES
(1, 'Pelanggaran Ringan',
 'Pelanggaran yang bersifat minor, sering tidak disengaja atau merupakan bagian dari proses perkembangan anak. Contoh: lupa membawa alat tulis, terlambat masuk kelas beberapa menit, bermain-main saat pelajaran berlangsung.',
 'Bersifat minor dan tidak disengaja • Belum menimbulkan dampak serius bagi diri sendiri, orang lain, maupun lingkungan sekolah • Umum terjadi karena kelalaian, kurangnya disiplin, atau kebiasaan yang belum terbentuk • Tidak menimbulkan kerusakan atau kerugian serius terhadap fasilitas, keamanan, atau kesejahteraan • Umumnya berskala kecil dan tanpa perencanaan',
 'Korban mungkin merasa terganggu tapi dampak minimal. Biasanya tidak ada dampak fisik/psikologis serius.',
 'Anak belajar tentang aturan dan konsekuensi. Bisa merasa malu atau perlu memperbaiki diri.',
 'Gangguan ringan terhadap ketertiban kelas. Bisa ditangani oleh guru kelas tanpa eskalasi.'),

(2, 'Pelanggaran Sedang',
 'Pelanggaran yang sudah disengaja dan berulang, mengganggu proses belajar mengajar, atau melibatkan konflik antar siswa.',
 'Sudah disengaja dan dilakukan secara berulang • Mengganggu proses belajar mengajar secara aktif • Melibatkan konflik antar siswa • Bersifat verbal, fisik ringan, sosial, atau relasional • Menunjukkan pola perilaku yang semakin kuat setelah diperingatkan • Bisa melibatkan penyalahgunaan fasilitas atau media digital secara ringan',
 'Korban merasa tidak aman atau tersinggung. Bisa mengalami penurunan konsentrasi atau rasa tidak nyaman.',
 'Mendapat konsekuensi lebih serius. Perlu refleksi dan bimbingan untuk memahami dampak perbuatannya.',
 'Membutuhkan perhatian guru BK. Bisa mengganggu suasana kelas jika tidak ditangani.'),

(3, 'Pelanggaran Berat',
 'Pelanggaran serius yang berpotensi membahayakan, merusak properti sekolah, atau melibatkan ketidakjujuran akademik.',
 'Menyebabkan kerusakan atau kerugian nyata terhadap fasilitas sekolah • Berpotensi membahayakan keselamatan warga sekolah • Ada niat jahat yang jelas dan disengaja • Berulang secara pola yang sistematis • Melibatkan ketidakjujuran akademik secara serius • Bisa melibatkan kekerasan fisik ringan atau intimidasi',
 'Korban mengalami dampak psikologis atau fisik yang signifikan. Bisa kehilangan rasa aman di sekolah.',
 'Dapat dikenakan sanksi berat hingga skorsing. Memerlukan intervensi intensif dan bantuan konseling.',
 'Membutuhkan koordinasi dengan orang tua dan possibly pihak eksternal. Reputation sekolah bisa terancam.'),

(4, 'Pelanggaran Sangat Berat',
 'Pelanggaran ekstrem yang mengancam keselamatan, melibatkan kekerasan serius, penyalahgunaan zat, atau tindakan kriminal.',
 'Mengancam keselamatan jiwa atau fisik secara serius • Dilakukan dengan rencana dan kesengajaan penuh • Melibatkan senjata, bahan berbahaya, atau zat terlarang • Bersifat kriminal dan melanggar hukum • Berpotensi menyebabkan trauma jangka panjang pada korban • Menyebarluaskan dampak negatif secara luas',
 'Korban bisa mengalami trauma berat, cedera fisik, atau dampak psikologis jangka panjang.',
 '面临最严格的纪律处分，包括开除。必须接受专业辅导和可能的法律后果。',
 'Kondisi darurat yang memerlukan koordinasi dengan kepala sekolah, orang tua, dan potentially pihak berwajib.')
ON CONFLICT DO NOTHING;

-- 3. Behavior Groups
INSERT INTO discipline_behavior_groups (id, category_id, group_name, description) VALUES
-- Kategori 1: Ringan
(1, 1, 'Keterlambatan dan Ketidaksiapan',
 'Berbagai bentuk terlambat atau tidak siap mengikuti pelajaran'),
(2, 1, 'Gangguan Kecil di Kelas',
 'Perilaku yang mengganggu jalannya pelajaran tapi berskala kecil'),

-- Kategori 2: Sedang
(3, 2, 'Penolakan Terhadap Otoritas',
 'Menentang atau tidak mengikuti instruksi guru'),
(4, 2, 'Konflik Antar Siswa',
 'Pertengkaran, perundungan verbal, atau eksklusi sosial'),

-- Kategori 3: Berat
(5, 3, 'Kerusakan Properti Sekolah',
 'Merusak atau mencoret fasilitas sekolah'),
(6, 3, 'Ketidakjujuran Akademik',
 'Menyontek, plagiarisme, atau memalsukan dokumen'),

-- Kategori 4: Sangat Berat
(7, 4, 'Kekerasan Fisik Berbahaya',
 'Tindakan kekerasan yang bisa menyebabkan cedera serius'),
(8, 4, 'Penyalahgunaan Zat',
 'Membawa atau menggunakan rokok, alkohol, atau narkoba di lingkungan sekolah'),
(9, 4, 'Pornografi dan Kekerasan Digital',
 'Menyebarkan konten tidak pantas atau melakukan kekerasan di dunia digital')
ON CONFLICT DO NOTHING;

-- 4. Behavior Details
INSERT INTO discipline_behavior_details (id, group_id, behavior_text) VALUES
-- Ringan: Keterlambatan (Group 1)
(1, 1, 'Terlambat masuk kelas kurang dari 10 menit tanpa alasan jelas.'),
(2, 1, 'Tidak membawa alat tulis atau buku yang diperlukan untuk pelajaran.'),
(3, 1, 'Belum mengerjakan PR pada saat yang dijadwalkan tanpa alasan.'),
(4, 1, 'Keluar masuk kelas tanpa izin guru.'),

-- Ringan: Gangguan Kecil (Group 2)
(5, 2, 'Berbicara sendiri atau with teman saat guru menjelaskan.'),
(6, 2, 'Bermain dengan pensil, penghapus, atau benda kecil saat pelajaran.'),
(7, 2, 'Meniru atau mengejek teman dengan nada bercanda yang mengganggu.'),
(8, 2, 'Tidak duduk di tempat duduk yang telah ditentukan.'),

-- Sedang: Penolakan Otoritas (Group 3)
(9, 3, 'Menolak mengikuti instruksi guru yang wajar.'),
(10, 3, 'Membantah atau menunjukkan sikap tidak sopan kepada guru.'),
(11, 3, 'Tidak mengikuti aturan yang berlaku di kelas atau sekolah.'),
(12, 3, 'Meninggalkan kelas tanpa izin.'),

-- Sedang: Konflik (Group 4)
(13, 4, 'Memanggil teman dengan nama buruk atau sindiran.'),
(14, 4, 'Memulai atau ikut-ikutan pertengkaran fisik kecil.'),
(15, 4, 'Sengaja mengucilkan atau menyisihkan teman dari kelompok.'),
(16, 4, 'Menyebarkan gosip atau rumors yang menyakiti perasaan teman.'),

-- Berat: Kerusakan Properti (Group 5)
(17, 5, 'Mencoret-coret meja, kursi, atau dinding sekolah.'),
(18, 5, 'Merusak atau merobek buku perpustakaan atau buku pelajaran.'),
(19, 5, 'Memain-main dengan alat-alat kelas seperti AC, proyektor, atau saklar.'),
(20, 5, 'Membuang sampah tidak pada tempatnya padahal sudah diperingatkan.'),

-- Berat: Ketidakjujuran (Group 6)
(21, 6, 'Menyontek saat ujian atau kuis.'),
(22, 6, 'Menyalin PR atau tugas teman tanpa kontribusi sendiri.'),
(23, 6, 'Memalsukan tanda tangan orang tua untuk izin atau surat.'),
(24, 6, 'Mengklaim karya orang lain sebagai karya sendiri (plagiarisme).'),

-- Sangat Berat: Kekerasan (Group 7)
(25, 7, 'Memukul atau menendang teman dengan sengaja.'),
(26, 7, 'Mencekik leher seseorang dengan sengaja.'),
(27, 7, 'Menggunakan benda keras atau tajam untuk menyakiti orang lain.'),
(28, 7, 'Mendorong seseorang dari ketinggian (jika di lantai 2 atau lebih).'),

-- Sangat Berat: Zat (Group 8)
(29, 8, 'Membawa atau menggunakan rokok di lingkungan sekolah.'),
(30, 8, 'Membawa atau menggunakan alkohol di lingkungan sekolah.'),
(31, 8, 'Membawa atau menggunakan narkoba/zat terlarang di sekolah.'),
(32, 8, 'Menjual atau menyalurkan rokok/zat kepada teman sekelas.'),

-- Sangat Berat: Digital (Group 9)
(33, 9, 'Mengambil foto atau video orang lain tanpa izin di tempat yang pribadi.'),
(34, 9, 'Menyebarkan foto atau video yang memalukan orang lain di media sosial.'),
(35, 9, 'Mengirim pesan-pesan yang mengancam atau menyinggung melalui media sosial.'),
(36, 9, 'Membuat akun palsu untuk menipu atau mempermalukan orang lain.')
ON CONFLICT DO NOTHING;

-- 5. Behavior Levels (pivot)
-- TK hanya berlaku untuk perilaku ringan dan sedang
INSERT INTO discipline_behavior_levels (behavior_id, level_id) VALUES
-- TK (1)
(1,1),(2,1),(3,1),(4,1),(5,1),(6,1),(7,1),(8,1),(9,1),(10,1),(11,1),(12,1),(13,1),(14,1),(15,1),(16,1)
ON CONFLICT DO NOTHING;

-- SD berlaku untuk semua
INSERT INTO discipline_behavior_levels (behavior_id, level_id)
SELECT id, 2 FROM discipline_behavior_details WHERE id BETWEEN 1 AND 16
ON CONFLICT DO NOTHING;
INSERT INTO discipline_behavior_levels (behavior_id, level_id)
SELECT id, 2 FROM discipline_behavior_details WHERE id BETWEEN 17 AND 36
ON CONFLICT DO NOTHING;

-- SMP tidak berlaku untuk perilaku TK-specific ringan
INSERT INTO discipline_behavior_levels (behavior_id, level_id)
SELECT id, 3 FROM discipline_behavior_details WHERE id BETWEEN 9 AND 36
ON CONFLICT DO NOTHING;

-- SMA sama dengan SMP
INSERT INTO discipline_behavior_levels (behavior_id, level_id)
SELECT id, 4 FROM discipline_behavior_details WHERE id BETWEEN 9 AND 36
ON CONFLICT DO NOTHING;

-- 6. Handling Guidelines
INSERT INTO discipline_handling_guidelines (category_id, level_id, target_type, step_number, guideline_text) VALUES
-- Kategori 1 (Ringan) - SD (2)
(1, 2, 'Identifikasi Awal', 1, 'Guru mencatat kejadian tanpa menghakimi. Catat tanggal, jam, dan deskripsi singkat.'),
(1, 2, 'Identifikasi Awal', 2, 'Tanya siswa dengan tenang: "Bolehceritakan apa yang terjadi?" — gunakan bahasa yang tidak menghakimi.'),
(1, 2, 'Penanganan Pelaku', 1, 'Beri kesempatan siswa menjelaskan situasinya. Dengarkan aktif tanpa memotong.'),
(1, 2, 'Penanganan Pelaku', 2, 'Tanyakan: "Apa yang bisa kamu lakukan berbeda lain kali?" — involve siswa dalam pemecahan masalah.'),
(1, 2, 'Penanganan Pelaku', 3, 'Tetapkan konsekuensi yang wajar dan konsisten dengan pelanggaran yang dilakukan.'),
(1, 2, 'Kolaborasi Orang Tua', 1, 'Hubungi orang tua jika perilaku terus berulang (3x atau lebih dalam seminggu).'),
(1, 2, 'Kolaborasi Orang Tua', 2, 'Sampaikan dengan nada positif: "Kami ingin bekerja sama mendukung perkembangan anak Anda."'),

-- Kategori 2 (Sedang) - SD
(2, 2, 'Identifikasi Awal', 1, 'Dokumentasikan insiden secara detail: siapa yang terlibat, di mana, kapan, bagaimana.'),
(2, 2, 'Identifikasi Awal', 2, 'Pisahkan siswa yang berkonflik untuk menenangkan situasi.'),
(2, 2, 'Penanganan Pelaku', 1, 'Ajak siswa ke ruang BK atau tempat yang private untuk percakapan serius.'),
(2, 2, 'Penanganan Pelaku', 2, 'Gunakan teknik reflective listening: "Aku dengar kamu marah karena..."'),
(2, 2, 'Penanganan Pelaku', 3, 'Buat kesepakatan tertulis kecil yang ditandatangani siswa dan guru.'),
(2, 2, 'Penanganan Korban', 1, 'Tanyakan perasaan korban: "Bagaimana kamu merasa setelah kejadian itu?"'),
(2, 2, 'Penanganan Korban', 2, 'Pastikan korban merasa aman. Beri opsi untuk tidak menghadapi pelaku jika belum siap.'),
(2, 2, 'Kolaborasi Orang Tua', 1, 'Hubungi kedua belah orang tua (pelaku dan korban) untuk koordinasi.'),
(2, 2, 'Kolaborasi Orang Tua', 2, 'Jadwalkan pertemuan jika diperlukan. Sampaikan fakta, bukan opini.'),

-- Kategori 3 (Berat) - SMP/SMA (3/4)
(3, 3, 'Identifikasi Awal', 1, 'Segera dokumentasikan dan amankan bukti (foto kerusakan, CCTV).'),
(3, 3, 'Penanganan Pelaku', 1, 'Panggil siswa ke ruang BK/TU dengan saksi. Tidak diisolasi sendirian.'),
(3, 3, 'Penanganan Pelaku', 2, 'Hubungi orang tua untuk pertemuan segera (dalam 24 jam).'),
(3, 3, 'Penanganan Pelaku', 3, 'Evaluasi apakah perlu skorsing sementara sambil menunggu proses.'),
(3, 3, 'Koordinasi', 1, 'Laporkan ke Wakamad/BK untuk didokumentasikan dalam sistem.'),
(3, 3, 'Koordinasi', 2, 'Jika melibatkan kerugian materiil, koordinasi dengan bagian TU untuk ganti rugi.'),

-- Kategori 4 (Sangat Berat) - SMA (4)
(4, 4, 'Identifikasi Awal', 1, 'Pastikan keamanan semua siswa terlebih dahulu. Evakuasi jika perlu.'),
(4, 4, 'Identifikasi Awal', 2, 'Amankan pelaku dari situasi. Jangan tinggalkan tanpa pengawasan.'),
(4, 4, 'Penanganan Pelaku', 1, 'Hubungi bagian keamanan sekolah dan/or pihak berwajib jika ada ancaman serius.'),
(4, 4, 'Penanganan Pelaku', 2, 'Wali kelas/BK mendokumentasikan pernyataan pelaku secara resmi.'),
(4, 4, 'Penanganan Pelaku', 3, 'Skorsing segera berlaku sambil menunggu hasil investigasi (maks 5 hari kerja).'),
(4, 4, 'Penanganan Korban', 1, 'Pastikan korban mendapat pertolongan pertama jika ada luka.'),
(4, 4, 'Penanganan Korban', 2, 'Sediakan konselor/guru BK untuk陪着 korban.'),
(4, 4, 'Koordinasi', 1, 'Kepala Sekolah diberitahu dalam 1x24 jam.'),
(4, 4, 'Koordinasi', 2, 'Orang tua pelaku dan korban dipanggil untuk pertemuan resmi.'),
(4, 4, 'Koordinasi', 3, 'Jika menyangkut tindakan kriminal, koordinasi dengan pihak berwajib.')
ON CONFLICT DO NOTHING;

-- 7. Consequence Guidelines
INSERT INTO discipline_consequence_guidelines (category_id, level_id, consequence_type, consequence_text) VALUES
-- Kategori 1 (Ringan)
(1, 1, 'Tugas Reflektif', 'TK: Menggambar cerita tentang "apa yang terjadi dan bagaimana rasanya" dengan bimbingan guru.'),
(1, 2, 'Tugas Reflektif', 'SD: Menulis 1-2 kalimat tentang apa yang terjadi dan bagaimana perasaan teman yang terganggu.'),
(1, 3, 'Tugas Reflektif', 'SMP: Membuat esai pendek (1 paragraph) refleksi tentang dampaknya terhadap diri sendiri dan orang lain.'),
(1, 4, 'Tugas Reflektif', 'SMA: Membuat esai refleksi 200-300 kata dengan pokok bahasan: tanggung jawab dan empati.'),

(1, 1, 'Perbaikan Langsung', 'TK: Membantu merapikan kelas atau membersihkan mainan sebagai bagian dari kegiatan.'),
(1, 2, 'Perbaikan Langsung', 'SD: Membantu merapikan meja kelas atau merawat tanaman sekolah.'),
(1, 3, 'Perbaikan Langsung', 'SMP/SMA: Membersihkan ruang kelas atau area sekolah yang kotor sebagai tanggung jawab sosial.'),

(1, 1, 'Pembatasan Sementara', 'TK: Tidak mengikuti aktivitas bermain tertentu selama 10-15 menit sebagai jeda.'),
(1, 2, 'Pembatasan Sementara', 'SD: Duduk di tempat yang berbeda di kelas selama 1 hari (tapi tetap participate dalam pelajaran).'),
(1, 3, 'Pembatasan Sementara', 'SMP/SMA: Tidak boleh mengikuti kegiatan ekstrakurikuler hari itu.'),

-- Kategori 2 (Sedang)
(2, 1, 'Konferensi Keluarga', 'TK: Pertemuan informal guru dan orang tua di kelas untuk discuss perkembangan anak.'),
(2, 2, 'Konferensi Keluarga', 'SD: Pertemuan orang tua dan guru BK untuk membahas pola perilaku dan strategi perbaikan.'),
(2, 3, 'Konferensi Keluarga', 'SMP/SMA: Pertemuan formal dengan orang tua, wali kelas, dan BK untuk membuat rencana aksi.'),

(2, 1, 'Tugas Reflektif', 'TK: Bercerita kepada guru tentang perasaan teman yang tersakiti menggunakan boneka/alat bantu.'),
(2, 2, 'Tugas Reflektif', 'SD: Menulis surat permintaan maaf kepada teman yang tersakiti (dengan bimbingan).'),
(2, 3, 'Tugas Reflektif', 'SMP/SMA: Membuat presentasi singkat tentang "Dampak words and actions" untuk kelas.'),

(2, 2, 'Skorsing Ringan', 'SD: Tidak masuk kelas selama 1 hari (di rumah dengan tugas sekolah dari guru).'),
(2, 3, 'Skorsing Ringan', 'SMP/SMA: Tidak masuk kelas 1-2 hari dengan tugas sekolah yang harus diselesaikan.'),

-- Kategori 3 (Berat)
(3, 2, 'Skorsing', 'SD: Skorsing di rumah 3-5 hari. Harus ada surat konfirmasi orang tua.'),
(3, 3, 'Skorsing', 'SMP/SMA: Skorsing 5-7 hari. Surat resmi dari kepala sekolah.'),
(3, 4, 'Skorsing', 'SMA: Skorsing 7-14 hari. Surat resmi + rencana perbaikan harus disetujui orang tua.'),

(3, 2, 'Ganti Rugi', 'SD: Orang tua mengganti biaya perbaikan kerusakan atau membeli alat yang dirusak.'),
(3, 3, 'Ganti Rugi', 'SMP/SMA: Siswa ikut serta dalam perbaikan fisik (dengan pengawasan) + penggantian biaya.'),

(3, 3, 'Tugas Karakter', 'SMP/SMA: Membuat journal harian tentang empati selama 2 minggu, dicek setiap pagi.'),
(3, 4, 'Tugas Karakter', 'SMA:volunteer untuk kegiatan sosial sekolah 4-8 jam sebagai restorative justice.'),

-- Kategori 4 (Sangat Berat)
(4, 3, 'Skorsing Berat', 'SMP: Skorsing 2-4 minggu. Tidak ada akses ke kegiatan sekolah.'),
(4, 4, 'Skorsing Berat', 'SMA: Skorsing 4-8 minggu. Review oleh Tim Disiplin sebelum kembali.'),
(4, 4, 'Skorsing Berat', 'SMA: Jika melibatkan narkoba/zat terlarang — rujukan wajib ke konselor profesional + tesurine.'),

(4, 3, 'Pelanggaran Surat Pernyataan', 'SMP: Surat pernyataan yang ditandatangani pelajar dan orang tua. Disimpan di file siswa.'),
(4, 4, 'Pelanggaran Surat Pernyataan', 'SMA: Surat pernyataan bermaterai. third violation = dipertimbangkan untuk dikeluarkan.'),

(4, 4, 'Koordinasi Pihak Luar', 'SMA: Untuk kasus kekerasan serius atau narkoba — koordinasi dengan psikolog/psikiater, possibly melibatkan pihak berwajib.')
ON CONFLICT DO NOTHING;

-- 8. Required Documents
INSERT INTO discipline_required_documents (category_id, level_id, document_name, template_url, description) VALUES
-- Kategori 2 (Sedang)
(2, 1, 'Formulir Catatan Perilaku TK', '/templates/disiplin/form-catatan-tk.docx', 'Formulir sederhana untuk mencatat insiden ringan di TK.'),
(2, 2, 'Formulir Catatan Perilaku SD', '/templates/disiplin/form-catatan-sd.docx', 'Formulir pencatatan untuk BK SD.'),
(2, 2, 'Surat Undangan Pertemuan Orang Tua', '/templates/disiplin/surat-pertemuan-ortu.docx', 'Surat undangan untuk conference orang tua.'),
(2, 3, 'Formulir Konferensi Kasus', '/templates/disiplin/form-konferensi-kasus.docx', 'Formulir untuk mendokumentasikan hasil konferensi.'),
(2, 3, 'Surat Undangan Pertemuan Orang Tua', '/templates/disiplin/surat-pertemuan-ortu.docx', 'Surat resmi mengundang orang tua.'),
(2, 4, 'Formulir Konferensi Kasus', '/templates/disiplin/form-konferensi-kasus.docx', 'Formulir conference resmi.'),
(2, 4, 'Surat Undangan Pertemuan Orang Tua', '/templates/disiplin/surat-pertemuan-ortu.docx', 'Surat undangan bermaterai.'),

-- Kategori 3 (Berat)
(3, 2, 'Surat Pemberitahuan Skorsing SD', '/templates/disiplin/surat-skorsing-sd.docx', 'Surat resmi skorsing untuk SD.'),
(3, 3, 'Surat Pemberitahuan Skorsing SMP', '/templates/disiplin/surat-skorsing-smp.docx', 'Surat resmi skorsing untuk SMP.'),
(3, 4, 'Surat Pemberitahuan Skorsing SMA', '/templates/disiplin/surat-skorsing-sma.docx', 'Surat resmi skorsing bermaterai untuk SMA.'),
(3, 3, 'Formulir Kesepakatan Perbaikan Perilaku', '/templates/disiplin/form-kesepakatan.docx', 'Formulir agreement antara sekolah, siswa, dan orang tua.'),
(3, 4, 'Formulir Kesepakatan Perbaikan Perilaku', '/templates/disiplin/form-kesepakatan-materai.docx', 'Formulir agreement bermaterai.'),
(3, 4, 'Surat Permintaan Ganti Rugi', '/templates/disiplin/surat-ganti-rugi.docx', 'Surat resmi permintaan ganti rugi kerusakan.'),

-- Kategori 4 (Sangat Berat)
(4, 3, 'Surat Pernyataan Disiplin SMP', '/templates/disiplin/surat-pernyataan-smp.docx', 'Surat pernyataan bermaterai untuk pelanggaran berat.'),
(4, 4, 'Surat Pernyataan Disiplin SMA', '/templates/disiplin/surat-pernyataan-sma.docx', 'Surat pernyataan bermaterai untuk pelanggaran sangat berat.'),
(4, 4, 'Formulir Rujukan Profesional', '/templates/disiplin/form-rujukan-profesional.docx', 'Formulir rujukan ke psikolog/psikiater.'),
(4, 4, 'Surat Koordinasi Pihak Berwajib', '/templates/disiplin/surat-koordinasi-wajib.docx', 'Surat koordinasi dengan pihak berwajib.'),
(4, 4, 'Formulir Investigasi Pelanggaran Berat', '/templates/disiplin/form-investigasi.docx', 'Formulir untuk mendokumentasikan investigasi.'),
(4, 4, 'Formulir Review Tim Disiplin', '/templates/disiplin/form-review-tim.docx', 'Formulir review untuk keputusan tim disiplin.')
ON CONFLICT DO NOTHING;