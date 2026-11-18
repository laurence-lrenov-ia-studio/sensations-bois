# Icônes techniques temporaires, indépendantes de la future maquette.
Add-Type -AssemblyName System.Drawing

$assetDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'public'
$icons = @(
  @{ Name = 'pwa-192.png'; Size = 192; FontSize = 68 },
  @{ Name = 'pwa-512.png'; Size = 512; FontSize = 180 },
  @{ Name = 'pwa-maskable-512.png'; Size = 512; FontSize = 150 }
)

foreach ($icon in $icons) {
  $bitmap = [System.Drawing.Bitmap]::new($icon.Size, $icon.Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#2d2925'))
  $foreground = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f5f3ef'))
  $font = [System.Drawing.Font]::new('Arial', $icon.FontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = [System.Drawing.StringFormat]::new()

  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.FillRectangle($background, 0, 0, $icon.Size, $icon.Size)
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $graphics.DrawString('SB', $font, $foreground, [System.Drawing.RectangleF]::new(0, 0, $icon.Size, $icon.Size), $format)
    $bitmap.Save((Join-Path $assetDirectory $icon.Name), [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $format.Dispose()
    $font.Dispose()
    $foreground.Dispose()
    $background.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}
