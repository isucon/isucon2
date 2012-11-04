<h2><?= $ticket['artist_name'] ?> : <?= $ticket['name'] ?></h2>
<ul>
<?php foreach ($variations as $variation) { ?>
<li class="variation">
  <form method="POST" action="/buy">
      <input type="hidden" name="ticket_id" value="<?= $ticket['id'] ?>" />
      <input type="hidden" name="variation_id" value="<?= $variation['id'] ?>" />
      <span class="variation_name"><?= $variation['name'] ?></span> 残り<span class="vacancy" id="vacancy_<?= $variation['id'] ?>"><?= $variation['vacancy'] ?></span>席
      <input type="text" name="member_id" value="" />
      <input type="submit" value="購入" />
  </form>
</li>
<?php } ?>
</ul>

<h3>席状況</h3>
<?php
    $to_02d = function ($i) { return $i < 10 ? "0$i" : $i; };
    foreach ($variations as $variation) {
        $stock = $variation['stock'];
?>
<h4><?= $variation['name'] ?></h4>
<table class="seats" data-variationid="<?= $variation['id'] ?>">
  <?php for ($row = 0; $row < 64; $row++) { ?>
  <tr>
    <?php
        for ($col = 0; $col < 64; $col++) {
            $key = $to_02d($row) . '-' . $to_02d($col);
    ?>
    <td id="<?= $key ?>" class="<?= $stock[$key]['order_id'] ? 'unavailable' : 'available' ?>"></td>
    <?php } ?>
  </tr>
  <?php } ?>
</table>
<?php } ?>
