<h2><?= $artist['name'] ?></h2>
<ul>
<?php foreach ($tickets as $ticket) { ?>
<li class="ticket">
  <a href="/ticket/<?= $ticket['id'] ?>"><?= $ticket['name'] ?></a>残り<span class="count"><?= $ticket['count'] ?></span>枚
</li>
<?php } ?>
</ul>
