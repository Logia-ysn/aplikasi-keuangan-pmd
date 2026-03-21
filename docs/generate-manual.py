#!/usr/bin/env python3
"""Generate PDF Manual for PMD Finance ERP Application."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, ListFlowable, ListItem, HRFlowable
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfgen import canvas
from reportlab.lib.fonts import addMapping
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os
from datetime import datetime

# ── Colors ──────────────────────────────────────────────────
C_PRIMARY = HexColor('#1e40af')
C_PRIMARY_LT = HexColor('#dbeafe')
C_ACCENT = HexColor('#2563eb')
C_DARK = HexColor('#1e293b')
C_MID = HexColor('#475569')
C_LIGHT = HexColor('#94a3b8')
C_BG = HexColor('#f8fafc')
C_BORDER = HexColor('#e2e8f0')
C_GREEN = HexColor('#16a34a')
C_RED = HexColor('#dc2626')
C_AMBER = HexColor('#d97706')
C_TEAL = HexColor('#0d9488')

W, H = A4  # 595 x 842 points

# ── Page Template ───────────────────────────────────────────
def header_footer(canvas_obj, doc):
    """Draw header and footer on each page."""
    canvas_obj.saveState()
    page_num = doc.page

    if page_num > 1:  # Skip cover page
        # Header line
        canvas_obj.setStrokeColor(C_PRIMARY)
        canvas_obj.setLineWidth(0.5)
        canvas_obj.line(2*cm, H - 1.5*cm, W - 2*cm, H - 1.5*cm)
        canvas_obj.setFont('Helvetica', 7)
        canvas_obj.setFillColor(C_LIGHT)
        canvas_obj.drawString(2*cm, H - 1.3*cm, 'PMD Finance v1.5.0 — Panduan Pengguna')
        canvas_obj.drawRightString(W - 2*cm, H - 1.3*cm, f'Halaman {page_num}')

        # Footer
        canvas_obj.setStrokeColor(C_BORDER)
        canvas_obj.line(2*cm, 1.5*cm, W - 2*cm, 1.5*cm)
        canvas_obj.setFont('Helvetica', 6.5)
        canvas_obj.setFillColor(C_LIGHT)
        canvas_obj.drawString(2*cm, 1.1*cm, 'PT Pangan Masa Depan — Dokumen Internal')
        canvas_obj.drawRightString(W - 2*cm, 1.1*cm, 'Dibuat: Maret 2026')

    canvas_obj.restoreState()


def build_cover(story, styles):
    """Build cover page."""
    story.append(Spacer(1, 6*cm))

    # Title block
    cover_title = ParagraphStyle('CoverTitle', parent=styles['Title'],
        fontSize=32, leading=38, textColor=C_PRIMARY, alignment=TA_CENTER,
        spaceAfter=8)
    cover_sub = ParagraphStyle('CoverSub', parent=styles['Normal'],
        fontSize=14, leading=20, textColor=C_MID, alignment=TA_CENTER,
        spaceAfter=4)
    cover_ver = ParagraphStyle('CoverVer', parent=styles['Normal'],
        fontSize=11, leading=16, textColor=C_ACCENT, alignment=TA_CENTER)

    story.append(Paragraph('PMD Finance', cover_title))
    story.append(Paragraph('Panduan Pengguna Aplikasi', cover_sub))
    story.append(Spacer(1, 0.5*cm))

    # Divider
    story.append(HRFlowable(width='40%', thickness=2, color=C_PRIMARY,
                            spaceAfter=12, spaceBefore=4, hAlign='CENTER'))

    story.append(Paragraph('Sistem ERP Keuangan', cover_ver))
    story.append(Paragraph('PT Pangan Masa Depan', cover_ver))
    story.append(Spacer(1, 1.5*cm))

    info_style = ParagraphStyle('CoverInfo', parent=styles['Normal'],
        fontSize=9, leading=14, textColor=C_LIGHT, alignment=TA_CENTER)
    story.append(Paragraph('Versi 1.5.0 &bull; Maret 2026', info_style))
    story.append(Paragraph('Platform: Raspberry Pi 5 &bull; PostgreSQL 16', info_style))
    story.append(Spacer(1, 4*cm))

    # Bottom info box
    box_data = [
        ['Disiapkan oleh', 'Tim IT — PT Pangan Masa Depan'],
        ['Klasifikasi', 'Dokumen Internal'],
        ['Tanggal', datetime.now().strftime('%d %B %Y')],
    ]
    box_table = Table(box_data, colWidths=[4*cm, 8*cm])
    box_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('TEXTCOLOR', (0, 0), (0, -1), C_LIGHT),
        ('TEXTCOLOR', (1, 0), (1, -1), C_MID),
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(box_table)
    story.append(PageBreak())


def build_toc(story, styles):
    """Build table of contents page."""
    toc_title = ParagraphStyle('TOCTitle', parent=styles['Heading1'],
        fontSize=20, textColor=C_PRIMARY, spaceAfter=20)
    story.append(Paragraph('Daftar Isi', toc_title))
    story.append(Spacer(1, 0.5*cm))

    toc_items = [
        ('1', 'Pendahuluan', '3'),
        ('2', 'Memulai Aplikasi', '4'),
        ('3', 'Dashboard', '5'),
        ('4', 'Bagan Akun (Chart of Accounts)', '6'),
        ('5', 'Buku Besar (General Ledger)', '8'),
        ('6', 'Invoice Penjualan', '9'),
        ('7', 'Invoice Pembelian', '11'),
        ('8', 'Bank & Kas (Pembayaran)', '12'),
        ('9', 'Pelanggan & Vendor', '14'),
        ('10', 'Stok & Gudang (Inventori)', '15'),
        ('11', 'Laporan Keuangan', '17'),
        ('12', 'Pengaturan', '21'),
        ('13', 'Tips & Trik', '23'),
        ('A', 'Lampiran: Daftar Akun Default', '24'),
    ]

    toc_num = ParagraphStyle('TOCNum', fontSize=10, textColor=C_PRIMARY,
        fontName='Helvetica-Bold')
    toc_text = ParagraphStyle('TOCText', fontSize=10, textColor=C_DARK)
    toc_page = ParagraphStyle('TOCPage', fontSize=10, textColor=C_LIGHT,
        alignment=TA_RIGHT)

    data = []
    for num, title, page in toc_items:
        data.append([
            Paragraph(num, toc_num),
            Paragraph(title, toc_text),
            Paragraph(page, toc_page),
        ])

    tbl = Table(data, colWidths=[1.2*cm, 11*cm, 1.5*cm])
    tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, 0), (-1, -2), 0.3, C_BORDER),
        ('LINEBELOW', (0, -1), (-1, -1), 0.3, C_BORDER),
    ]))
    story.append(tbl)
    story.append(PageBreak())


# ── Reusable helpers ────────────────────────────────────────
def heading1(text):
    return Paragraph(text, ParagraphStyle('H1Custom', fontName='Helvetica-Bold',
        fontSize=18, leading=24, textColor=C_PRIMARY, spaceBefore=16, spaceAfter=10))

def heading2(text):
    return Paragraph(text, ParagraphStyle('H2Custom', fontName='Helvetica-Bold',
        fontSize=13, leading=18, textColor=C_DARK, spaceBefore=14, spaceAfter=6))

def heading3(text):
    return Paragraph(text, ParagraphStyle('H3Custom', fontName='Helvetica-Bold',
        fontSize=10.5, leading=15, textColor=C_ACCENT, spaceBefore=10, spaceAfter=4))

def body(text):
    return Paragraph(text, ParagraphStyle('BodyCustom', fontName='Helvetica',
        fontSize=9, leading=14, textColor=C_DARK, spaceAfter=6, alignment=TA_JUSTIFY))

def note_box(text, color=C_PRIMARY_LT, border=C_ACCENT):
    """Colored info box."""
    style = ParagraphStyle('NoteBox', fontName='Helvetica', fontSize=8.5,
        leading=13, textColor=C_DARK)
    p = Paragraph(text, style)
    t = Table([[p]], colWidths=[13.6*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), color),
        ('BOX', (0, 0), (-1, -1), 0.5, border),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    return t

def bullet_list(items):
    """Create a bulleted list."""
    style = ParagraphStyle('BulletItem', fontName='Helvetica', fontSize=9,
        leading=13, textColor=C_DARK)
    return ListFlowable(
        [ListItem(Paragraph(item, style), bulletColor=C_ACCENT) for item in items],
        bulletType='bullet', bulletFontSize=6, leftIndent=14,
        spaceBefore=2, spaceAfter=6
    )

def field_table(fields, col1_title='Field', col2_title='Keterangan'):
    """Create a field description table."""
    header_style = ParagraphStyle('FTHead', fontName='Helvetica-Bold',
        fontSize=8, textColor=white)
    cell_style = ParagraphStyle('FTCell', fontName='Helvetica', fontSize=8,
        leading=12, textColor=C_DARK)
    bold_cell = ParagraphStyle('FTBold', fontName='Helvetica-Bold', fontSize=8,
        leading=12, textColor=C_DARK)

    data = [[Paragraph(col1_title, header_style), Paragraph(col2_title, header_style)]]
    for name, desc in fields:
        data.append([Paragraph(name, bold_cell), Paragraph(desc, cell_style)])

    t = Table(data, colWidths=[4*cm, 9.6*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
    ]))
    return t

def divider():
    return HRFlowable(width='100%', thickness=0.5, color=C_BORDER,
                      spaceAfter=8, spaceBefore=8)

# ── Content Builders ────────────────────────────────────────
def ch1_pendahuluan(story):
    story.append(heading1('1. Pendahuluan'))
    story.append(body(
        '<b>PMD Finance</b> adalah aplikasi ERP (Enterprise Resource Planning) berbasis web '
        'yang dirancang khusus untuk mengelola keuangan PT Pangan Masa Depan, sebuah perusahaan '
        'penggilingan padi. Aplikasi ini mencakup seluruh siklus akuntansi mulai dari pencatatan '
        'transaksi hingga pelaporan keuangan.'
    ))
    story.append(heading2('1.1 Fitur Utama'))
    story.append(bullet_list([
        '<b>Dashboard</b> — Ringkasan KPI keuangan secara real-time',
        '<b>Bagan Akun</b> — Struktur Chart of Accounts hierarkis',
        '<b>Buku Besar</b> — Pencatatan jurnal umum (double-entry)',
        '<b>Penjualan</b> — Invoice penjualan & piutang usaha',
        '<b>Pembelian</b> — Invoice pembelian & hutang usaha',
        '<b>Bank & Kas</b> — Pembayaran, penerimaan, pinbuk (transfer)',
        '<b>Pelanggan & Vendor</b> — Manajemen mitra bisnis',
        '<b>Stok & Gudang</b> — Master item, gerakan stok, produksi',
        '<b>Laporan Keuangan</b> — 6 jenis laporan (Neraca Saldo, Laba Rugi, Neraca, Arus Kas, Aging AR/AP)',
        '<b>Pengaturan</b> — Tahun buku, profil perusahaan, pembaruan aplikasi',
    ]))
    story.append(heading2('1.2 Spesifikasi Teknis'))
    story.append(field_table([
        ('Platform Server', 'Raspberry Pi 5 (LAN + Cloudflare Tunnel)'),
        ('Database', 'PostgreSQL 16'),
        ('Bahasa Antarmuka', 'Bahasa Indonesia'),
        ('Mata Uang', 'IDR — Rupiah Indonesia'),
        ('Browser', 'Chrome 90+, Firefox 88+, Safari 14+, Edge 90+'),
        ('Akses', 'Web browser — tidak perlu install aplikasi'),
    ], 'Komponen', 'Detail'))
    story.append(heading2('1.3 Hak Akses Pengguna'))
    story.append(body('Terdapat 3 level akses dalam aplikasi:'))
    story.append(field_table([
        ('Admin', 'Akses penuh: semua fitur, hapus data, tutup buku, kelola pengguna'),
        ('Accountant', 'Entri data: buat invoice, jurnal, pembayaran. Tidak bisa hapus akun.'),
        ('Viewer', 'Hanya baca: lihat laporan dan data tanpa bisa mengubah'),
    ], 'Role', 'Hak Akses'))
    story.append(PageBreak())


def ch2_memulai(story):
    story.append(heading1('2. Memulai Aplikasi'))
    story.append(heading2('2.1 Cara Login'))
    story.append(body(
        'Buka browser dan akses alamat aplikasi yang telah diberikan oleh administrator. '
        'Anda akan melihat halaman login.'
    ))
    story.append(Spacer(1, 4))
    story.append(body('<b>Langkah-langkah:</b>'))
    story.append(bullet_list([
        'Masukkan <b>Email</b> yang telah didaftarkan oleh administrator',
        'Masukkan <b>Password</b> Anda (gunakan tombol mata untuk show/hide)',
        'Klik tombol <b>"Masuk"</b>',
        'Jika lupa password, hubungi Administrator perusahaan',
    ]))
    story.append(note_box(
        '<b>Catatan Keamanan:</b> Sistem akan membatasi percobaan login hingga 10 kali '
        'dalam 15 menit. Jika melebihi batas, akun akan terkunci sementara.'
    ))
    story.append(Spacer(1, 6))
    story.append(heading2('2.2 Navigasi Utama'))
    story.append(body(
        'Setelah login, Anda akan diarahkan ke <b>Dashboard</b>. Di sisi kiri terdapat '
        '<b>Sidebar</b> navigasi yang berisi menu utama aplikasi.'
    ))
    story.append(Spacer(1, 4))
    story.append(field_table([
        ('Dashboard', 'Ringkasan KPI dan grafik keuangan'),
        ('Bagan Akun', 'Struktur akun (Chart of Accounts)'),
        ('Buku Besar', 'Jurnal umum dan entri manual'),
        ('Penjualan', 'Invoice penjualan (piutang)'),
        ('Pembelian', 'Invoice pembelian (hutang)'),
        ('Stok & Gudang', 'Inventori dan produksi'),
        ('Bank & Kas', 'Pembayaran dan penerimaan kas'),
        ('Pelanggan & Vendor', 'Data mitra bisnis'),
        ('Laporan Keuangan', '6 jenis laporan keuangan'),
        ('Pengaturan', 'Konfigurasi sistem'),
    ], 'Menu', 'Fungsi'))
    story.append(Spacer(1, 6))
    story.append(body(
        'Sidebar dapat dilipat dengan mengklik tombol panah di bagian atas. '
        'Pada layar mobile, sidebar otomatis tersembunyi dan dapat dibuka dengan ikon menu.'
    ))
    story.append(PageBreak())


def ch3_dashboard(story):
    story.append(heading1('3. Dashboard'))
    story.append(body(
        'Dashboard menampilkan ringkasan posisi keuangan perusahaan secara real-time. '
        'Halaman ini adalah tampilan pertama setelah login.'
    ))
    story.append(heading2('3.1 Kartu KPI'))
    story.append(body('Terdapat 4 kartu indikator utama di bagian atas:'))
    story.append(field_table([
        ('Total Kas & Bank', 'Saldo gabungan seluruh akun kas dan bank aktif'),
        ('Piutang Usaha', 'Total tagihan yang belum dibayar oleh pelanggan'),
        ('Hutang Usaha', 'Total kewajiban yang belum dibayar ke supplier'),
        ('Laba Bersih (Bulan Ini)', 'Selisih pendapatan dikurangi beban bulan berjalan'),
    ], 'Kartu', 'Penjelasan'))
    story.append(heading2('3.2 Grafik Pendapatan vs Beban'))
    story.append(body(
        'Grafik area menampilkan tren pendapatan (biru) dan beban (abu-abu) selama 6 bulan terakhir. '
        'Gunakan grafik ini untuk melihat tren keuangan secara visual.'
    ))
    story.append(heading2('3.3 Aktivitas Terakhir'))
    story.append(body(
        'Panel di sisi kanan menampilkan 6 transaksi pembayaran terakhir dengan indikator warna: '
        '<font color="#16a34a"><b>hijau</b></font> untuk uang masuk dan '
        '<font color="#dc2626"><b>merah</b></font> untuk uang keluar. '
        'Klik "Lihat semua" untuk membuka halaman Bank & Kas.'
    ))
    story.append(PageBreak())


def ch4_coa(story):
    story.append(heading1('4. Bagan Akun (Chart of Accounts)'))
    story.append(body(
        'Bagan Akun adalah fondasi sistem akuntansi. Seluruh transaksi dicatat ke akun-akun '
        'yang tersusun secara hierarkis (parent-child). Akun dikelompokkan berdasarkan 5 tipe utama.'
    ))
    story.append(heading2('4.1 Tipe Akun'))
    story.append(field_table([
        ('ASSET (Aset)', 'Harta perusahaan: kas, bank, piutang, persediaan, aset tetap'),
        ('LIABILITY (Liabilitas)', 'Kewajiban: hutang usaha, hutang gaji, hutang pajak'),
        ('EQUITY (Ekuitas)', 'Modal: modal disetor, laba ditahan, laba tahun berjalan'),
        ('REVENUE (Pendapatan)', 'Penghasilan: penjualan beras, penjualan dedak, dll.'),
        ('EXPENSE (Beban)', 'Pengeluaran: pembelian gabah, listrik, gaji, transportasi'),
    ], 'Tipe', 'Penjelasan'))
    story.append(heading2('4.2 Navigasi Pohon Akun'))
    story.append(bullet_list([
        'Klik tanda <b>panah</b> di samping akun grup untuk expand/collapse',
        'Gunakan <b>kotak pencarian</b> untuk mencari akun berdasarkan nama atau nomor',
        'Akun <b>grup</b> (folder biru) hanya sebagai pengelompokan, tidak bisa diisi transaksi',
        'Akun <b>detail</b> (abu-abu) adalah akun yang bisa menerima transaksi',
    ]))
    story.append(heading2('4.3 Menambah Akun Baru'))
    story.append(body('<b>Menambah Akun Root (level tertinggi):</b>'))
    story.append(bullet_list([
        'Klik tombol <b>"+ Tambah Akun Root"</b> di kanan atas',
        'Isi nomor akun (contoh: 1.3), pilih tipe root, dan nama akun',
        'Centang "Jadikan Akun Grup" jika akun ini akan menjadi parent',
        'Klik <b>"Simpan Akun"</b>',
    ]))
    story.append(body('<b>Menambah Sub-akun:</b>'))
    story.append(bullet_list([
        'Hover pada akun grup yang diinginkan',
        'Klik ikon <b>"+ Tambah Sub-akun"</b>',
        'Tipe root otomatis mengikuti parent',
        'Isi nomor dan nama, lalu simpan',
    ]))
    story.append(heading2('4.4 Set Saldo Awal'))
    story.append(body(
        'Untuk mengisi saldo awal akun (saat pertama kali menggunakan sistem):'
    ))
    story.append(bullet_list([
        'Hover pada akun detail, klik ikon <b>dompet</b> (Set Saldo Awal)',
        'Masukkan nominal saldo baru',
        'Sistem otomatis membuat jurnal saldo awal terhadap akun <b>Laba Ditahan</b>',
    ]))
    story.append(note_box(
        '<b>Penting:</b> Saldo awal sebaiknya diisi sebelum memulai transaksi harian. '
        'Pastikan total saldo awal seimbang antara aset dan kewajiban + ekuitas.'
    ))
    story.append(heading2('4.5 Menghapus Akun'))
    story.append(body('Akun hanya bisa dihapus jika memenuhi syarat:'))
    story.append(bullet_list([
        'Tidak memiliki sub-akun (children)',
        'Tidak memiliki transaksi terkait',
        'Saldo nol',
    ]))
    story.append(PageBreak())


def ch5_buku_besar(story):
    story.append(heading1('5. Buku Besar (General Ledger)'))
    story.append(body(
        'Buku Besar menampilkan seluruh entri jurnal yang tercatat dalam sistem. '
        'Jurnal dibuat secara otomatis saat invoice atau pembayaran dicatat, '
        'atau bisa dibuat manual untuk transaksi khusus (contoh: biaya listrik, gaji, dll.).'
    ))
    story.append(heading2('5.1 Melihat Daftar Jurnal'))
    story.append(bullet_list([
        'Gunakan <b>kotak pencarian</b> untuk mencari berdasarkan nomor referensi atau keterangan',
        'Klik tombol <b>"Bulan Ini"</b> untuk memfilter jurnal bulan berjalan',
        'Klik <b>"Hapus Filter"</b> (muncul saat filter aktif) untuk kembali ke semua data',
        'Setiap baris menampilkan: tanggal, referensi, keterangan, akun terkait, debit, kredit, status',
    ]))
    story.append(heading2('5.2 Membuat Jurnal Manual'))
    story.append(body('Klik tombol <b>"+ Buat Jurnal Baru"</b> di kanan atas. Isi form berikut:'))
    story.append(field_table([
        ('Tanggal', 'Tanggal transaksi (harus dalam tahun buku yang sedang berjalan)'),
        ('Keterangan / Narasi', 'Deskripsi transaksi, contoh: "Bayar listrik Maret 2026"'),
        ('Baris Jurnal', 'Minimal 2 baris: satu debit dan satu kredit'),
        ('Akun', 'Pilih akun dari dropdown (hanya akun detail, bukan grup)'),
        ('Debit', 'Jumlah yang didebit (tidak boleh isi debit DAN kredit di satu baris)'),
        ('Kredit', 'Jumlah yang dikredit'),
    ]))
    story.append(Spacer(1, 4))
    story.append(note_box(
        '<b>Prinsip Double-Entry:</b> Total debit HARUS sama dengan total kredit. '
        'Sistem akan menampilkan status "Jurnal Seimbang" (hijau) atau "Selisih: Rp xxx" (merah). '
        'Jurnal tidak bisa disimpan jika tidak seimbang.'
    ))
    story.append(heading2('5.3 Contoh Jurnal Umum'))
    # Example journal entries
    ex_data = [
        ['Transaksi', 'Debit', 'Kredit'],
        ['Bayar Listrik Rp 8.5 juta', '', ''],
        ['    5.2.1 Listrik & Air Pabrik', 'Rp 8.500.000', '—'],
        ['    1.1.2 Bank BCA', '—', 'Rp 8.500.000'],
        ['Transfer Kas ke Bank Rp 25 juta', '', ''],
        ['    1.1.1 Kas Utama', 'Rp 25.000.000', '—'],
        ['    1.1.2 Bank BCA', '—', 'Rp 25.000.000'],
    ]
    ex_style = ParagraphStyle('ExCell', fontName='Helvetica', fontSize=8, leading=11)
    t = Table(ex_data, colWidths=[7*cm, 3*cm, 3*cm])
    t.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
        ('FONTNAME', (0, 1), (0, 1), 'Helvetica-Bold'),
        ('FONTNAME', (0, 4), (0, 4), 'Helvetica-Bold'),
    ]))
    story.append(t)
    story.append(PageBreak())


def ch6_penjualan(story):
    story.append(heading1('6. Invoice Penjualan'))
    story.append(body(
        'Modul ini digunakan untuk mencatat penjualan kepada pelanggan. '
        'Setiap invoice yang disimpan akan otomatis membuat jurnal akuntansi '
        '(Debit Piutang Usaha, Kredit Penjualan) dan menambah saldo piutang pelanggan.'
    ))
    story.append(heading2('6.1 Ringkasan Halaman'))
    story.append(body('Di bagian atas terdapat 4 kartu ringkasan:'))
    story.append(bullet_list([
        '<b>Total Invoice</b> — jumlah invoice yang tercatat',
        '<b>Total Piutang</b> — total tagihan yang belum dibayar (merah)',
        '<b>Sudah Lunas</b> — jumlah invoice yang sudah lunas (hijau)',
        '<b>Jatuh Tempo</b> — jumlah invoice yang sudah melewati tanggal jatuh tempo (oranye)',
    ]))
    story.append(heading2('6.2 Filter & Pencarian'))
    story.append(bullet_list([
        'Cari berdasarkan <b>nomor invoice</b> atau <b>nama pelanggan</b>',
        'Filter berdasarkan <b>status</b>: Semua / Diajukan / Sebagian Lunas / Lunas',
        'Filter berdasarkan <b>rentang tanggal</b>: Dari - s/d',
    ]))
    story.append(heading2('6.3 Membuat Invoice Baru'))
    story.append(body('Klik <b>"+ Buat Invoice Baru"</b>, lalu isi:'))
    story.append(field_table([
        ('Tagihkan Kepada *', 'Pilih pelanggan dari dropdown. Info kontak otomatis tampil.'),
        ('Tanggal Invoice', 'Tanggal penerbitan invoice'),
        ('Jatuh Tempo', 'Batas waktu pembayaran (default: +30 hari)'),
        ('Termin Pembayaran', 'Pilihan: Net 7 / Net 14 / Net 30 / Net 60 / COD'),
        ('Item Lines', 'Nama item, deskripsi, qty, satuan, harga, diskon %'),
        ('Pajak %', 'Persentase PPN (contoh: 11 untuk PPN 11%)'),
        ('Potongan', 'Potongan harga tambahan (contoh: rabat)'),
        ('Biaya Lain', 'Biaya tambahan (contoh: ongkos kirim)'),
        ('Catatan', 'Catatan internal atau untuk pelanggan'),
    ]))
    story.append(Spacer(1, 4))
    story.append(body('<b>Kalkulasi otomatis:</b>'))
    story.append(body(
        'Grand Total = Subtotal + Pajak - Potongan + Biaya Lain'
    ))
    story.append(heading2('6.4 Melihat Detail Invoice'))
    story.append(body(
        'Klik baris invoice pada tabel untuk membuka panel detail di sisi kanan. '
        'Panel ini menampilkan informasi lengkap termasuk item, perhitungan, dan riwayat pembayaran.'
    ))
    story.append(heading2('6.5 Status Invoice'))
    story.append(field_table([
        ('Diajukan (Submitted)', 'Invoice baru dibuat, belum ada pembayaran'),
        ('Sebagian Lunas (PartiallyPaid)', 'Sudah menerima sebagian pembayaran'),
        ('Lunas (Paid)', 'Seluruh tagihan sudah dibayar'),
    ], 'Status', 'Penjelasan'))
    story.append(note_box(
        '<b>Catatan:</b> Status invoice akan otomatis berubah saat pembayaran dicatat '
        'di modul Bank & Kas. Anda tidak perlu mengubah status secara manual.'
    ))
    story.append(PageBreak())


def ch7_pembelian(story):
    story.append(heading1('7. Invoice Pembelian'))
    story.append(body(
        'Modul ini mencatat pembelian dari supplier/vendor. Setiap invoice pembelian '
        'otomatis membuat jurnal (Debit Persediaan Gabah, Kredit Hutang Usaha) dan '
        'menambah saldo hutang ke supplier.'
    ))
    story.append(heading2('7.1 Perbedaan dengan Penjualan'))
    story.append(field_table([
        ('Mitra', 'Supplier/Vendor (bukan Customer)'),
        ('Akun Debit', 'Persediaan Gabah (Aset), bukan Piutang'),
        ('Akun Kredit', 'Hutang Usaha (Liabilitas), bukan Penjualan'),
        ('Sisa', '"Sisa Hutang" (bukan "Sisa Tagihan")'),
    ], 'Aspek', 'Invoice Pembelian'))
    story.append(heading2('7.2 Alur Kerja Pembelian'))
    story.append(bullet_list([
        '<b>Terima gabah</b> dari petani/supplier',
        '<b>Buat Invoice Pembelian</b> dengan detail item dan harga per kg',
        'Sistem otomatis <b>posting jurnal</b>: Dr Persediaan / Cr Hutang Usaha',
        '<b>Bayar supplier</b> melalui modul Bank & Kas saat jatuh tempo',
        'Status invoice otomatis berubah menjadi <b>Lunas</b> atau <b>Sebagian</b>',
    ]))
    story.append(note_box(
        '<b>Contoh:</b> Beli 10.000 kg gabah @ Rp 5.800/kg dari Petani Sukaraja.<br/>'
        'Grand Total = 10.000 x 5.800 = Rp 58.000.000<br/>'
        'Jurnal otomatis: Dr Persediaan Gabah Rp 58 juta / Cr Hutang Usaha Rp 58 juta'
    ))
    story.append(PageBreak())


def ch8_bank_kas(story):
    story.append(heading1('8. Bank & Kas (Pembayaran)'))
    story.append(body(
        'Modul ini mencatat seluruh transaksi kas dan bank: pembayaran ke supplier, '
        'penerimaan dari pelanggan, dan transfer antar rekening (pinbuk). '
        'Setiap transaksi otomatis ter-alokasi ke invoice yang tertunggak.'
    ))
    story.append(heading2('8.1 Tipe Transaksi'))
    story.append(field_table([
        ('Terima Pembayaran', 'Uang masuk dari pelanggan (Dr Bank/Kas, Cr Piutang Usaha)'),
        ('Catat Pengeluaran', 'Uang keluar ke supplier (Dr Hutang Usaha, Cr Bank/Kas)'),
        ('Pinbuk (Transfer)', 'Transfer antar rekening (Dr Kas, Cr Bank atau sebaliknya)'),
    ], 'Tombol', 'Fungsi'))
    story.append(heading2('8.2 Menerima Pembayaran dari Pelanggan'))
    story.append(body('Klik <b>"Terima Pembayaran"</b>, lalu isi:'))
    story.append(field_table([
        ('Tanggal', 'Tanggal transaksi pembayaran diterima'),
        ('Pihak Terkait *', 'Pilih pelanggan yang membayar'),
        ('Rekening *', 'Akun kas/bank tujuan (contoh: Bank BCA, Kas Utama)'),
        ('Jumlah *', 'Nominal pembayaran yang diterima'),
        ('Nomor Referensi', 'Nomor bukti transfer / kwitansi (opsional)'),
        ('Catatan', 'Keterangan tambahan (opsional)'),
    ]))
    story.append(Spacer(1, 4))
    story.append(note_box(
        '<b>Auto-Alokasi:</b> Sistem otomatis mengalokasikan pembayaran ke invoice tertua '
        '(FIFO — First In, First Out). Jika pembayaran Rp 100 juta dan ada 2 invoice '
        '(Rp 60 juta + Rp 40 juta), kedua invoice akan otomatis berubah status menjadi Lunas.'
    ))
    story.append(heading2('8.3 Membayar Supplier'))
    story.append(body(
        'Klik <b>"Catat Pengeluaran"</b>. Form sama seperti penerimaan, '
        'tetapi pihak terkait adalah Supplier dan akun yang dipilih adalah sumber dana.'
    ))
    story.append(heading2('8.4 Transfer Antar Rekening (Pinbuk)'))
    story.append(body(
        'Klik <b>"Pinbuk"</b> untuk memindahkan dana antar akun kas/bank. '
        'Contoh: transfer dari Bank BCA ke Kas Utama Rp 25 juta. '
        'Sistem membuat jurnal: Dr Kas Utama / Cr Bank BCA.'
    ))
    story.append(heading2('8.5 Overpayment (Kelebihan Bayar)'))
    story.append(body(
        'Jika jumlah pembayaran melebihi total tagihan pelanggan, sistem akan mencatat '
        'seluruh amount ke jurnal (karena uang memang diterima), namun sisa yang tidak '
        'teralokasi akan di-log sebagai peringatan. Saldo piutang pelanggan bisa menjadi negatif '
        '(menandakan deposit/kelebihan bayar).'
    ))
    story.append(heading2('8.6 Validasi'))
    story.append(bullet_list([
        'Akun pembayaran <b>harus</b> bertipe kas/bank (dimulai dengan 1.1.1 atau 1.1.2)',
        'Mitra bisnis harus berstatus <b>aktif</b> (tidak bisa bayar ke mitra nonaktif)',
        'Tanggal harus dalam periode <b>tahun buku terbuka</b>',
    ]))
    story.append(PageBreak())


def ch9_parties(story):
    story.append(heading1('9. Pelanggan & Vendor'))
    story.append(body(
        'Halaman ini mengelola data mitra bisnis (pelanggan dan supplier). '
        'Setiap mitra dapat memiliki saldo piutang (pelanggan) atau hutang (supplier).'
    ))
    story.append(heading2('9.1 Menambah Mitra Baru'))
    story.append(body('Klik <b>"+ Tambah Mitra Baru"</b>, lalu isi:'))
    story.append(field_table([
        ('Tipe *', 'Pilih: Pelanggan, Vendor, atau Keduanya'),
        ('Nama / Perusahaan *', 'Nama lengkap mitra atau perusahaan'),
        ('Nomor Telepon', 'Nomor HP atau telepon kantor'),
        ('Email', 'Alamat email'),
        ('Alamat', 'Alamat lengkap'),
        ('NPWP', 'Nomor Pokok Wajib Pajak (opsional)'),
    ]))
    story.append(heading2('9.2 Kartu Mitra'))
    story.append(body(
        'Setiap mitra ditampilkan dalam format kartu yang menunjukkan:'
    ))
    story.append(bullet_list([
        '<b>Avatar</b> dengan inisial nama dan badge tipe (PELANGGAN/VENDOR)',
        '<b>Kontak</b>: email, telepon, alamat',
        '<b>Saldo Terutang</b>: jumlah tagihan/hutang yang masih outstanding',
        '<b>Menu aksi</b> (titik tiga): Edit dan Hapus',
    ]))
    story.append(heading2('9.3 Menghapus Mitra'))
    story.append(body(
        'Jika mitra <b>tidak punya transaksi</b>: data dihapus permanen.<br/>'
        'Jika mitra <b>punya transaksi</b> (invoice/pembayaran): data hanya dinonaktifkan '
        '(ditandai "Nonaktif") dan tidak bisa digunakan untuk transaksi baru.'
    ))
    story.append(PageBreak())


def ch10_inventory(story):
    story.append(heading1('10. Stok & Gudang (Inventori)'))
    story.append(body(
        'Modul inventori terdiri dari 3 tab: Master Item, Riwayat Gerakan Stok, dan Proses Produksi. '
        'Modul ini khusus untuk mengelola persediaan fisik (gabah, beras, dedak, sekam).'
    ))
    story.append(heading2('10.1 Tab: Master Item'))
    story.append(body('Kelola daftar item inventori perusahaan.'))
    story.append(field_table([
        ('Kode Item *', 'Kode unik, contoh: GBK-001, BRS-PRM'),
        ('Nama Item *', 'Nama lengkap, contoh: Gabah Kering Panen'),
        ('Satuan *', 'Unit pengukuran: kg, ton, sak, liter, pcs'),
        ('Kategori', 'Pengelompokan: Bahan Baku, Produk Jadi, Produk Sampingan'),
        ('Stok Minimum', 'Batas minimum stok. Jika di bawah, tampil peringatan.'),
    ]))
    story.append(heading2('10.2 Tab: Riwayat Gerakan Stok'))
    story.append(body('Catat setiap pergerakan fisik barang masuk/keluar gudang.'))
    story.append(field_table([
        ('Masuk (In)', 'Barang masuk gudang (contoh: terima gabah dari supplier)'),
        ('Keluar (Out)', 'Barang keluar gudang (contoh: kirim beras ke pelanggan)'),
        ('Penyesuaian +', 'Koreksi penambahan stok (contoh: selisih stock opname)'),
        ('Penyesuaian -', 'Koreksi pengurangan stok (contoh: barang rusak)'),
    ], 'Tipe Gerakan', 'Keterangan'))
    story.append(heading2('10.3 Tab: Proses Produksi'))
    story.append(body(
        'Catat proses penggilingan padi: gabah (input) menjadi beras, dedak, dan sekam (output). '
        'Sistem otomatis menghitung rendemen (persentase hasil produksi).'
    ))
    story.append(body('<b>Contoh Produksi:</b>'))
    ex_data = [
        ['Komponen', 'Item', 'Kuantitas', 'Rendemen'],
        ['INPUT', 'Gabah Kering Panen', '10.000 kg', '100%'],
        ['OUTPUT', 'Beras Premium 5%', '6.200 kg', '62%'],
        ['OUTPUT', 'Beras Medium 15%', '500 kg', '5%'],
        ['OUTPUT', 'Dedak/Bekatul', '800 kg', '8%'],
        ['OUTPUT', 'Sekam', '2.000 kg', '20%'],
        ['SUSUT', '(Loss)', '500 kg', '5%'],
    ]
    t = Table(ex_data, colWidths=[2.5*cm, 4.5*cm, 3*cm, 2.5*cm])
    t.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
        ('BACKGROUND', (0, 1), (-1, 1), HexColor('#fef3c7')),
    ]))
    story.append(t)
    story.append(PageBreak())


def ch11_laporan(story):
    story.append(heading1('11. Laporan Keuangan'))
    story.append(body(
        'PMD Finance menyediakan 6 jenis laporan keuangan standar. '
        'Setiap laporan dapat dicetak, diekspor ke PDF, atau diekspor ke Excel.'
    ))
    story.append(heading2('11.1 Neraca Saldo (Trial Balance)'))
    story.append(body(
        'Menampilkan saldo debit dan kredit setiap akun untuk memverifikasi keseimbangan. '
        'Total debit harus sama dengan total kredit. Jika tidak seimbang, tampil peringatan kuning.'
    ))
    story.append(bullet_list([
        '<b>Filter</b>: Rentang tanggal (Dari — s/d)',
        '<b>Pencarian</b>: Berdasarkan nama atau nomor akun',
        '<b>Kolom</b>: No. Akun, Nama Akun, Debit, Kredit',
        '<b>Footer</b>: Total Saldo (harus seimbang)',
    ]))
    story.append(divider())

    story.append(heading2('11.2 Laporan Laba Rugi (Profit & Loss)'))
    story.append(body(
        'Menampilkan performa keuangan perusahaan dalam periode tertentu: '
        'pendapatan dikurangi beban = laba (atau rugi) bersih.'
    ))
    story.append(bullet_list([
        '<b>Kartu ringkasan</b>: Total Pendapatan (hijau), Total Beban (merah), Laba Bersih (biru)',
        '<b>Seksi I</b>: Pendapatan — daftar akun pendapatan dengan saldo',
        '<b>Seksi II</b>: Beban-Beban — daftar akun beban dengan saldo',
        '<b>Footer</b>: Laba (Rugi) Bersih — selisih pendapatan dan beban',
    ]))
    story.append(divider())

    story.append(heading2('11.3 Neraca (Balance Sheet)'))
    story.append(body(
        'Menampilkan posisi keuangan perusahaan pada tanggal tertentu. '
        'Harus memenuhi persamaan: <b>Aset = Kewajiban + Ekuitas</b>.'
    ))
    story.append(bullet_list([
        '<b>Filter</b>: Tanggal tertentu (per tanggal)',
        '<b>Layout 2 kolom</b>: Kiri (Aset), Kanan (Kewajiban + Ekuitas)',
        '<b>Laba Tahun Berjalan</b> otomatis dihitung dan ditampilkan di Ekuitas',
        '<b>Peringatan</b>: Jika A tidak sama L+E, tampil alert kuning',
    ]))
    story.append(divider())

    story.append(heading2('11.4 Laporan Arus Kas (Cash Flow)'))
    story.append(body(
        'Menampilkan pergerakan kas masuk dan keluar, dikelompokkan menjadi 3 aktivitas:'
    ))
    story.append(field_table([
        ('Aktivitas Operasi', 'Kas dari operasional bisnis (penjualan, pembelian, gaji, dll.)'),
        ('Aktivitas Investasi', 'Kas dari pembelian/penjualan aset tetap'),
        ('Aktivitas Pendanaan', 'Kas dari modal, pinjaman, atau pembayaran dividen'),
    ], 'Aktivitas', 'Penjelasan'))
    story.append(body(
        'Di bagian bawah terdapat <b>Perubahan Kas Bersih</b> = Operasi + Investasi + Pendanaan.'
    ))
    story.append(divider())

    story.append(heading2('11.5 Aging Piutang (Aging AR)'))
    story.append(body(
        'Menganalisis umur piutang pelanggan berdasarkan tanggal jatuh tempo invoice. '
        'Membantu mengetahui pelanggan mana yang terlambat membayar.'
    ))
    story.append(field_table([
        ('Belum Jatuh Tempo', 'Invoice belum melewati due date (hijau)'),
        ('1-30 Hari', 'Terlambat 1 sampai 30 hari'),
        ('31-60 Hari', 'Terlambat 31 sampai 60 hari (kuning)'),
        ('61-90 Hari', 'Terlambat 61 sampai 90 hari (oranye)'),
        ('>90 Hari', 'Terlambat lebih dari 90 hari — KRITIS (merah)'),
    ], 'Bucket', 'Keterangan'))
    story.append(divider())

    story.append(heading2('11.6 Aging Hutang (Aging AP)'))
    story.append(body(
        'Sama seperti Aging Piutang, tetapi untuk hutang ke supplier. '
        'Membantu memastikan pembayaran ke supplier tepat waktu.'
    ))
    story.append(Spacer(1, 6))
    story.append(heading2('11.7 Ekspor & Cetak'))
    story.append(body('Semua laporan memiliki 3 tombol ekspor di kanan atas:'))
    story.append(bullet_list([
        '<b>Cetak</b> — Membuka dialog cetak browser (Ctrl+P). Layout otomatis A4, sidebar/header tersembunyi.',
        '<b>Export PDF</b> — Download laporan dalam format PDF dengan header perusahaan.',
        '<b>Export Excel</b> — Download data dalam format .xlsx untuk analisis lanjutan.',
    ]))
    story.append(PageBreak())


def ch12_pengaturan(story):
    story.append(heading1('12. Pengaturan'))
    story.append(body(
        'Halaman pengaturan terdiri dari 3 tab: Tahun Buku, Profil Perusahaan, dan Tentang Aplikasi.'
    ))
    story.append(heading2('12.1 Tahun Buku (Fiscal Year)'))
    story.append(body(
        'Tahun buku mendefinisikan periode akuntansi perusahaan. '
        'Semua transaksi harus masuk dalam tahun buku yang sedang terbuka.'
    ))
    story.append(body('<b>Membuat Tahun Buku Baru:</b>'))
    story.append(bullet_list([
        'Klik <b>"+ Tahun Buku Baru"</b>',
        'Isi nama (contoh: "2027"), tanggal mulai, dan tanggal selesai',
        'Sistem akan validasi agar tidak tumpang tindih dengan tahun buku lain',
    ]))
    story.append(body('<b>Menutup Tahun Buku (Tutup Buku):</b>'))
    story.append(bullet_list([
        'Klik tombol <b>"Tutup Buku"</b> pada kartu tahun buku yang ingin ditutup',
        'Sistem akan: (1) menghitung laba/rugi bersih, (2) transfer ke Laba Ditahan, '
        '(3) me-reset saldo akun pendapatan & beban untuk tahun tersebut',
        'Setelah ditutup, tidak ada transaksi baru yang bisa diposting ke tahun tersebut',
    ]))
    story.append(note_box(
        '<b>PERINGATAN:</b> Tutup buku adalah proses PERMANEN dan tidak bisa dibatalkan. '
        'Pastikan semua transaksi sudah dicatat dengan benar sebelum menutup tahun buku.',
        HexColor('#fef2f2'), C_RED
    ))
    story.append(heading2('12.2 Profil Perusahaan'))
    story.append(body('Informasi perusahaan yang akan tampil di laporan dan header aplikasi:'))
    story.append(field_table([
        ('Logo Perusahaan', 'Upload file PNG/JPG/SVG (maks 2MB). Tampil di sidebar dan laporan PDF.'),
        ('Nama Perusahaan', 'Tampil di header, sidebar, dan semua laporan'),
        ('Alamat', 'Alamat kantor/pabrik perusahaan'),
        ('Nomor Telepon', 'Telepon utama perusahaan'),
        ('Email', 'Email resmi perusahaan'),
        ('NPWP', 'Nomor Pokok Wajib Pajak perusahaan'),
        ('Mata Uang', 'Default: IDR (Rupiah Indonesia)'),
    ]))
    story.append(heading2('12.3 Tentang Aplikasi'))
    story.append(body('Tab ini menampilkan informasi versi dan changelog aplikasi.'))
    story.append(body('<b>Fitur Periksa Pembaruan:</b>'))
    story.append(bullet_list([
        'Klik tombol <b>"Periksa Pembaruan"</b>',
        'Sistem mengecek versi terbaru dari GitHub repository',
        'Jika ada pembaruan, tampil instruksi update server',
        'Jika sudah terbaru, tampil pesan konfirmasi hijau',
    ]))
    story.append(body('<b>Cara Update Server:</b>'))
    cmd_style = ParagraphStyle('CmdStyle', fontName='Courier', fontSize=8,
        leading=12, textColor=C_DARK, backColor=HexColor('#f1f5f9'),
        borderWidth=0.5, borderColor=C_BORDER, borderPadding=8)
    story.append(Paragraph(
        'cd ~/aplikasi-keuangan-pmd<br/>'
        'git pull origin main<br/>'
        'cd client &amp;&amp; npm run build<br/>'
        'pm2 restart pmd-server',
        cmd_style
    ))
    story.append(PageBreak())


def ch13_tips(story):
    story.append(heading1('13. Tips & Trik'))

    story.append(heading2('13.1 Alur Kerja Harian'))
    story.append(bullet_list([
        'Cek <b>Dashboard</b> setiap pagi untuk melihat posisi keuangan',
        'Catat <b>invoice pembelian</b> saat gabah diterima dari petani/supplier',
        'Catat <b>gerakan stok masuk</b> di modul Stok & Gudang',
        'Catat <b>proses produksi</b> setelah penggilingan selesai',
        'Buat <b>invoice penjualan</b> saat beras dikirim ke pelanggan',
        'Catat <b>pembayaran</b> saat menerima atau mengirim uang',
        'Catat <b>biaya operasional</b> (listrik, transport, gaji) di Buku Besar',
    ]))

    story.append(heading2('13.2 Shortcut Keyboard'))
    story.append(field_table([
        ('Escape', 'Menutup modal atau panel yang sedang terbuka'),
        ('Tab', 'Berpindah antar field dalam form'),
        ('Enter', 'Submit form (pada beberapa modal)'),
        ('Ctrl + P', 'Cetak halaman/laporan yang sedang aktif'),
    ], 'Tombol', 'Fungsi'))

    story.append(heading2('13.3 Troubleshooting'))
    story.append(field_table([
        ('Tidak bisa login', 'Periksa email dan password. Setelah 10x gagal, tunggu 15 menit.'),
        ('Invoice gagal disimpan', 'Pastikan pelanggan/supplier dipilih dan minimal 1 item diisi.'),
        ('Jurnal tidak seimbang', 'Pastikan total debit = total kredit. Satu baris hanya boleh debit ATAU kredit.'),
        ('Akun tidak bisa dihapus', 'Akun masih punya sub-akun atau transaksi terkait.'),
        ('Mitra tidak bisa dihapus', 'Mitra punya invoice/pembayaran. Akan dinonaktifkan, bukan dihapus.'),
        ('Laporan tidak muncul', 'Pastikan rentang tanggal yang dipilih sesuai dan tahun buku terbuka.'),
    ], 'Masalah', 'Solusi'))
    story.append(PageBreak())


def appendix_coa(story):
    story.append(heading1('Lampiran A: Daftar Akun Default'))
    story.append(body('Berikut adalah daftar akun (Chart of Accounts) bawaan sistem:'))
    story.append(Spacer(1, 4))

    accounts = [
        ['1', 'Aset', 'ASSET', 'Grup'],
        ['1.1', 'Aset Lancar', 'ASSET', 'Grup'],
        ['1.1.1', 'Kas Utama', 'ASSET', 'Detail'],
        ['1.1.2', 'Bank BCA', 'ASSET', 'Detail'],
        ['1.1.3', 'Piutang Usaha', 'ASSET', 'Detail'],
        ['1.1.4', 'Persediaan Gabah', 'ASSET', 'Detail'],
        ['1.1.5', 'Persediaan Beras', 'ASSET', 'Detail'],
        ['2', 'Liabilitas', 'LIABILITY', 'Grup'],
        ['2.1', 'Liabilitas Jangka Pendek', 'LIABILITY', 'Grup'],
        ['2.1.1', 'Hutang Usaha', 'LIABILITY', 'Detail'],
        ['2.1.2', 'Hutang Gaji', 'LIABILITY', 'Detail'],
        ['3', 'Ekuitas', 'EQUITY', 'Grup'],
        ['3.1', 'Modal Disetor', 'EQUITY', 'Detail'],
        ['3.2', 'Laba Ditahan', 'EQUITY', 'Grup'],
        ['3.2.1', 'Laba Ditahan Akumulasi', 'EQUITY', 'Detail'],
        ['3.3', 'Laba Periode Berjalan', 'EQUITY', 'Grup'],
        ['3.3.1', 'Laba Tahun Berjalan', 'EQUITY', 'Detail'],
        ['4', 'Pendapatan', 'REVENUE', 'Grup'],
        ['4.1', 'Pendapatan Usaha', 'REVENUE', 'Grup'],
        ['4.1.1', 'Penjualan Beras Premium', 'REVENUE', 'Detail'],
        ['4.2', 'Penjualan Sekam', 'REVENUE', 'Detail'],
        ['4.3', 'Penjualan Bekatul', 'REVENUE', 'Detail'],
        ['5', 'Beban', 'EXPENSE', 'Grup'],
        ['5.1', 'Harga Pokok', 'EXPENSE', 'Grup'],
        ['5.1.1', 'Pembelian Gabah', 'EXPENSE', 'Detail'],
        ['5.2', 'Beban Operasional', 'EXPENSE', 'Grup'],
        ['5.2.1', 'Listrik & Air Pabrik', 'EXPENSE', 'Detail'],
        ['5.2.2', 'Gaji Karyawan', 'EXPENSE', 'Detail'],
        ['5.2.3', 'Biaya Transportasi', 'EXPENSE', 'Detail'],
        ['5.2.4', 'Biaya Solar/BBM Mesin', 'EXPENSE', 'Detail'],
    ]

    header = ['No. Akun', 'Nama Akun', 'Tipe', 'Jenis']
    data = [header] + accounts
    t = Table(data, colWidths=[2.2*cm, 5.5*cm, 2.5*cm, 2*cm])
    t.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7.5),
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
        ('FONTNAME', (0, 1), (0, -1), 'Courier'),
    ]))
    story.append(t)


# ── Main Build ──────────────────────────────────────────────
def main():
    output_path = '/Users/yay/Project/finance-pmd/docs/PMD-Finance-Panduan-Pengguna-v1.5.0.pdf'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        topMargin=2*cm,
        bottomMargin=2*cm,
        leftMargin=2*cm,
        rightMargin=2*cm,
        title='PMD Finance — Panduan Pengguna',
        author='PT Pangan Masa Depan',
        subject='Panduan Penggunaan Aplikasi ERP Keuangan',
    )

    styles = getSampleStyleSheet()
    story = []

    # Build all sections
    build_cover(story, styles)
    build_toc(story, styles)
    ch1_pendahuluan(story)
    ch2_memulai(story)
    ch3_dashboard(story)
    ch4_coa(story)
    ch5_buku_besar(story)
    ch6_penjualan(story)
    ch7_pembelian(story)
    ch8_bank_kas(story)
    ch9_parties(story)
    ch10_inventory(story)
    ch11_laporan(story)
    ch12_pengaturan(story)
    ch13_tips(story)
    appendix_coa(story)

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f'PDF generated: {output_path}')
    print(f'Size: {os.path.getsize(output_path) / 1024:.0f} KB')


if __name__ == '__main__':
    main()
